require('dotenv').config({ quiet: true });
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

const BASELINE_MIGRATION = '0_postgresql_baseline';
const DEFAULT_TENANT_ID = '00000000-0000-4000-8000-000000000001';
const DEFAULT_TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG || 'hgi';
const DEFAULT_TENANT_NAME = process.env.DEFAULT_TENANT_NAME || 'Holiday Inn Baku';
const TENANT_TABLES = [
  'Department', 'User', 'CustomRole', 'Document', 'DocumentVersion', 'DocumentHistory',
  'DocumentComment', 'DocumentAttachment', 'Template', 'WorkflowRoute', 'Signature',
  'AuditLog', 'Notification', 'SystemSettings', 'UserFavorite', 'Conversation',
  'ConversationParticipant', 'Message', 'WorkforcePosition', 'Vendor', 'VendorServiceRate',
  'VendorApprovalEvent', 'WorkforceApprovalRoute', 'DepartmentCasualBudget',
  'WorkforceSettings', 'WorkforceRequest', 'WorkforceRequestItem',
  'WorkforceVendorCorrectionReview', 'WorkforceVendorCorrection',
  'WorkforceQualityEvaluation', 'WorkforceRequestEvent', 'WorkforceRequestTemplate',
  'VendorInvite', 'VendorInvoice', 'EmailOutbox',
];

function databaseUrlWithSystemContext() {
  const url = new URL(process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL);
  const currentOptions = url.searchParams.get('options') || '';
  url.searchParams.set('options', `${currentOptions} -c hoterra.tenant_id=*`.trim());
  if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '2');
  return url.toString();
}

function runPrisma(args) {
  const prismaCli = require.resolve('prisma/build/index.js');
  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: databaseUrlWithSystemContext() },
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`Prisma ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}`);
  }
}

async function tableExists(db, tableName) {
  const rows = await db.$queryRawUnsafe(
    'SELECT to_regclass($1) IS NOT NULL AS "exists"',
    `public."${tableName}"`
  );
  return Boolean(rows[0]?.exists);
}

async function prepareExistingDatabase(db) {
  if (!(await tableExists(db, 'Tenant'))) return false;

  const tenants = await db.$queryRawUnsafe(
    'SELECT "id", "slug" FROM "Tenant" WHERE "slug" = $1 LIMIT 1',
    DEFAULT_TENANT_SLUG
  );
  let tenantId = tenants[0]?.id;
  if (!tenantId) {
    await db.$executeRawUnsafe(
      'INSERT INTO "Tenant" ("id", "name", "slug", "isActive", "createdAt", "updatedAt") VALUES ($1, $2, $3, true, NOW(), NOW())',
      DEFAULT_TENANT_ID,
      DEFAULT_TENANT_NAME,
      DEFAULT_TENANT_SLUG
    );
    tenantId = DEFAULT_TENANT_ID;
  }

  for (const tableName of TENANT_TABLES) {
    if (!/^[A-Za-z][A-Za-z0-9]+$/.test(tableName) || !(await tableExists(db, tableName))) continue;
    await db.$executeRawUnsafe(
      `UPDATE "${tableName}" SET "tenantId" = $1 WHERE "tenantId" IS NULL`,
      tenantId
    );
  }

  return true;
}

async function baselineIfRequired(db, hasExistingSchema) {
  if (!hasExistingSchema) return;
  const hasMigrationTable = await tableExists(db, '_prisma_migrations');
  if (hasMigrationTable) {
    const rows = await db.$queryRawUnsafe(
      'SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = $1 AND "finished_at" IS NOT NULL LIMIT 1',
      BASELINE_MIGRATION
    );
    if (rows.length) return;
  }

  console.log(`[database] Baselining existing PostgreSQL schema as ${BASELINE_MIGRATION}`);
  await db.$disconnect();
  runPrisma(['migrate', 'resolve', '--applied', BASELINE_MIGRATION]);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (!process.env.DATABASE_URL.startsWith('postgresql://') && !process.env.DATABASE_URL.startsWith('postgres://')) {
    throw new Error('Production migrations require PostgreSQL DATABASE_URL');
  }

  const db = new PrismaClient({ datasources: { db: { url: databaseUrlWithSystemContext() } } });
  try {
    const hasExistingSchema = await prepareExistingDatabase(db);
    await baselineIfRequired(db, hasExistingSchema);
  } finally {
    await db.$disconnect().catch(() => undefined);
  }

  runPrisma(['migrate', 'deploy']);
}

main().catch((error) => {
  console.error('[database]', error instanceof Error ? error.message : error);
  process.exit(1);
});
