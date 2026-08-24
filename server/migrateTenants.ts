import './loadEnv';
import { systemPrisma } from './db';

export const HGI_TENANT_ID = '00000000-0000-4000-8000-000000000001';
export const HGI_TENANT_SLUG = 'hgi';

export async function migrateExistingDataToHgiTenant() {
  const tenant = await systemPrisma.tenant.upsert({
    where: { slug: HGI_TENANT_SLUG },
    update: { name: 'Holiday Inn Baku', isActive: true },
    create: {
      id: HGI_TENANT_ID,
      name: 'Holiday Inn Baku',
      slug: HGI_TENANT_SLUG,
      isActive: true,
    },
  });

  const tables = await systemPrisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'tenantId'
  `;

  for (const { table_name: tableName } of tables) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(tableName)) {
      throw new Error(`Unsafe tenant table name: ${tableName}`);
    }
    await systemPrisma.$executeRawUnsafe(
      `UPDATE "${tableName}" SET "tenantId" = $1 WHERE "tenantId" IS NULL`,
      tenant.id
    );
  }

  console.log(`[tenant-migration] Existing data is assigned to ${tenant.slug}.${process.env.TENANT_BASE_DOMAIN || 'hoterra.net'}`);
  return tenant;
}

if (require.main === module) {
  migrateExistingDataToHgiTenant()
    .catch((error) => {
      console.error('[tenant-migration]', error);
      process.exitCode = 1;
    })
    .finally(() => systemPrisma.$disconnect());
}
