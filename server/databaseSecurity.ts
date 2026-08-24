import { systemPrisma } from './db';
import { isProduction } from './config';

type SecurityRow = {
  isSuperuser: boolean;
  tenantContext: string | null;
  rlsTableCount: bigint;
};

export async function assertDatabaseSecurity(): Promise<void> {
  const rows = await systemPrisma.$queryRaw<SecurityRow[]>`
    SELECT
      current_setting('hoterra.tenant_id', true) AS "tenantContext",
      (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS "isSuperuser",
      (
        SELECT COUNT(*)
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relrowsecurity = true
          AND c.relforcerowsecurity = true
      ) AS "rlsTableCount"
  `;
  const row = rows[0];
  const failures: string[] = [];
  if (row?.tenantContext !== '*') failures.push('system database client is missing wildcard tenant context');
  if (Number(row?.rlsTableCount || 0) < 35) failures.push('tenant RLS policies are not fully enabled');
  if (row?.isSuperuser) failures.push('DATABASE_URL uses a PostgreSQL superuser, which can bypass RLS');

  if (failures.length) {
    const message = `Database security check failed: ${failures.join('; ')}`;
    if (isProduction) throw new Error(message);
    console.warn(`[database-security] ${message}`);
  }
}
