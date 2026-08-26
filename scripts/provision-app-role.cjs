require('dotenv').config({ quiet: true });
const { PrismaClient } = require('@prisma/client');

const adminUrl = process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL;
const roleName = process.env.APP_DATABASE_USER || 'hoterra_app';
const rolePassword = process.env.APP_DATABASE_PASSWORD;

function identifier(value) {
  if (!/^[a-z][a-z0-9_]{2,62}$/.test(value)) throw new Error('APP_DATABASE_USER must be a safe PostgreSQL role name');
  return `"${value}"`;
}

function literal(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

function quotedIdentifier(value) {
  return `"${value.replace(/"/g, '""')}"`;
}

async function main() {
  if (!adminUrl) throw new Error('DATABASE_ADMIN_URL is required');
  if (!rolePassword || rolePassword.length < 24) throw new Error('APP_DATABASE_PASSWORD must contain at least 24 characters');

  const role = identifier(roleName);
  const db = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  try {
    const exists = await db.$queryRawUnsafe('SELECT 1 FROM pg_roles WHERE rolname = $1', roleName);
    if (!exists.length) {
      await db.$executeRawUnsafe(`CREATE ROLE ${role} LOGIN PASSWORD ${literal(rolePassword)} NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT`);
    } else {
      await db.$executeRawUnsafe(`ALTER ROLE ${role} WITH LOGIN PASSWORD ${literal(rolePassword)} NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT`);
    }
    const databaseName = decodeURIComponent(new URL(adminUrl).pathname.slice(1));
    await db.$executeRawUnsafe(`GRANT CONNECT ON DATABASE ${quotedIdentifier(databaseName)} TO ${role}`);
    await db.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await db.$executeRawUnsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role}`);
    await db.$executeRawUnsafe(`REVOKE INSERT, DELETE ON TABLE "Tenant" FROM ${role}`);
    await db.$executeRawUnsafe(`REVOKE UPDATE, DELETE ON TABLE "AuditLog" FROM ${role}`);
    await db.$executeRawUnsafe(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
    await db.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role}`);
    await db.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${role}`);
    console.log(`[database-role] ${roleName} is provisioned as a non-superuser application role`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error('[database-role]', error instanceof Error ? error.message : error);
  process.exit(1);
});
