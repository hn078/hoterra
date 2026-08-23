import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { Prisma, PrismaClient } from '@prisma/client';

const sqlitePath = path.resolve(process.argv[2] || 'prisma/dev.db');
const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });
const postgres = new PrismaClient();

function delegateName(model: string) {
  return model[0].toLowerCase() + model.slice(1);
}

function convertRow(model: Prisma.DMMF.Model, row: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const field of model.fields) {
    if (field.kind === 'object' || !(field.name in row)) continue;
    const value = row[field.name];
    if (value === null) data[field.name] = null;
    else if (field.type === 'Boolean') data[field.name] = Boolean(value);
    else if (field.type === 'DateTime') {
      const numeric = typeof value === 'number' || typeof value === 'bigint' || /^\d+$/.test(String(value));
      data[field.name] = new Date(numeric ? Number(value) : String(value));
    }
    else if (field.type === 'Json' && typeof value === 'string') data[field.name] = JSON.parse(value);
    else data[field.name] = value;
  }
  return data;
}

async function main() {
  const models = Prisma.dmmf.datamodel.models;
  const sourceCounts: Record<string, number> = {};

  await postgres.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET session_replication_role = 'replica'");
    const tables = models.map((model) => `"${model.dbName || model.name}"`).join(', ');
    await tx.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE`);

    for (const model of models) {
      const table = model.dbName || model.name;
      const rows = sqlite.prepare(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[];
      sourceCounts[model.name] = rows.length;
      if (!rows.length) continue;
      const delegate = (tx as unknown as Record<string, { createMany(args: unknown): Promise<unknown> }>)[delegateName(model.name)];
      await delegate.createMany({ data: rows.map((row) => convertRow(model, row)) });
      console.log(`${model.name}: ${rows.length}`);
    }
    await tx.$executeRawUnsafe("SET session_replication_role = 'origin'");
  }, { timeout: 120_000 });

  for (const model of models) {
    const delegate = (postgres as unknown as Record<string, { count(): Promise<number> }>)[delegateName(model.name)];
    const targetCount = await delegate.count();
    if (targetCount !== sourceCounts[model.name]) {
      throw new Error(`${model.name}: source=${sourceCounts[model.name]}, target=${targetCount}`);
    }
  }
  console.log('Migration completed and row counts verified.');
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => { sqlite.close(); await postgres.$disconnect(); });
