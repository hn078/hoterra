import { systemPrisma } from './db';
import { isProduction } from './config';

type SecurityRow = {
  isSuperuser: boolean;
  bypassRls: boolean;
  tenantContext: string | null;
  rlsTableCount: bigint;
  wildcardPolicyCount: bigint;
  auditUpdatePrivilege: boolean;
  auditDeletePrivilege: boolean;
};

export async function assertDatabaseSecurity(): Promise<void> {
  const rows = await systemPrisma.$queryRaw<SecurityRow[]>`
    SELECT
      current_setting('hoterra.tenant_id', true) AS "tenantContext",
      (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS "isSuperuser",
      (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS "bypassRls",
      has_table_privilege(current_user, 'public."AuditLog"', 'UPDATE') AS "auditUpdatePrivilege",
      has_table_privilege(current_user, 'public."AuditLog"', 'DELETE') AS "auditDeletePrivilege",
      (
        SELECT COUNT(*)
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relrowsecurity = true
          AND c.relforcerowsecurity = true
      ) AS "rlsTableCount",
      (
        SELECT COUNT(*)
        FROM pg_policies
        WHERE schemaname = 'public'
          AND (COALESCE(qual, '') LIKE '%tenant_id%*%' OR COALESCE(with_check, '') LIKE '%tenant_id%*%')
      ) AS "wildcardPolicyCount"
  `;
  const row = rows[0];
  const failures: string[] = [];
  if (row?.tenantContext !== '__system__') failures.push('runtime system database client has an unsafe tenant context');
  if (Number(row?.rlsTableCount || 0) < 35) failures.push('tenant RLS policies are not fully enabled');
  if (row?.isSuperuser) failures.push('DATABASE_URL uses a PostgreSQL superuser, which can bypass RLS');
  if (row?.bypassRls) failures.push('DATABASE_URL uses a PostgreSQL BYPASSRLS role');
  if (row?.auditUpdatePrivilege || row?.auditDeletePrivilege) failures.push('runtime database role can mutate the append-only AuditLog');
  if (Number(row?.wildcardPolicyCount || 0) > 0) failures.push('tenant RLS policies still permit the deprecated wildcard context');

  if (failures.length) {
    const message = `Database security check failed: ${failures.join('; ')}`;
    if (isProduction) throw new Error(message);
    console.warn(`[database-security] ${message}`);
  }
}
