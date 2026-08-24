const { randomUUID } = require('node:crypto');
const { prisma, systemPrisma } = require('../dist-server/db.js');
const { runWithTenant } = require('../dist-server/lib/tenantContext.js');

async function main() {
  const suffix = randomUUID().replace(/-/g, '').slice(0, 10);
  const testTenant = await systemPrisma.tenant.create({
    data: { name: `Isolation Test ${suffix}`, slug: `isolation-${suffix}` },
  });
  const primaryTenant = await systemPrisma.tenant.findUnique({
    where: { slug: process.env.DEFAULT_TENANT_SLUG || 'hgi' },
  });
  if (!primaryTenant) throw new Error('Primary tenant is missing');

  const code = `T${suffix.slice(0, 6).toUpperCase()}`;
  let primaryDepartmentId;
  try {
    const testDepartment = await runWithTenant(testTenant, () => prisma.department.create({
      data: {
        tenantId: primaryTenant.id,
        name: `Tenant Test ${suffix}`,
        code,
      },
    }));
    if (testDepartment.tenantId !== testTenant.id) {
      throw new Error('Create tenant override was not blocked');
    }

    const leaked = await runWithTenant(primaryTenant, () => prisma.department.findUnique({
      where: { id: testDepartment.id },
    }));
    if (leaked) throw new Error('Cross-tenant read leaked a record');

    const primaryDepartment = await runWithTenant(primaryTenant, () => prisma.department.create({
      data: { name: `Primary Test ${suffix}`, code },
    }));
    primaryDepartmentId = primaryDepartment.id;

    let crossTenantUpdateBlocked = false;
    try {
      await runWithTenant(primaryTenant, () => prisma.department.update({
        where: { id: testDepartment.id },
        data: { name: 'This must not be written' },
      }));
    } catch {
      crossTenantUpdateBlocked = true;
    }
    if (!crossTenantUpdateBlocked) throw new Error('Cross-tenant update was not blocked');

    let crossTenantRelationBlocked = false;
    try {
      await runWithTenant(primaryTenant, () => prisma.workforcePosition.create({
        data: { name: `Cross Tenant ${suffix}`, departmentId: testDepartment.id },
      }));
    } catch {
      crossTenantRelationBlocked = true;
    }
    if (!crossTenantRelationBlocked) throw new Error('Cross-tenant relation was not blocked');

    console.log('[tenant-test] read, write override, update, relation and tenant-scoped unique checks passed');
  } finally {
    if (primaryDepartmentId) {
      await systemPrisma.department.deleteMany({ where: { id: primaryDepartmentId } });
    }
    await systemPrisma.department.deleteMany({ where: { tenantId: testTenant.id } });
    await systemPrisma.tenant.delete({ where: { id: testTenant.id } });
    await systemPrisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[tenant-test]', error);
  process.exit(1);
});
