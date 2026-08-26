const { randomUUID } = require('node:crypto');
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('@prisma/client');
require('../dist-server/loadEnv.js');
const { prisma, systemPrisma, disconnectPrisma } = require('../dist-server/db.js');
const { runWithTenant } = require('../dist-server/lib/tenantContext.js');

function assertSafeDatabaseTargets(adminUrl) {
  const runtimeUrl = process.env.DATABASE_URL;
  if (!runtimeUrl) throw new Error('DATABASE_URL is required for the tenant-isolation runtime client');
  const admin = new URL(adminUrl);
  const runtime = new URL(runtimeUrl);
  if (admin.host !== runtime.host || admin.pathname !== runtime.pathname) {
    throw new Error('DATABASE_ADMIN_URL and DATABASE_URL must target the same database');
  }
  const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
  if (!localHosts.has(admin.hostname) && process.env.TENANT_ISOLATION_ALLOW_REMOTE !== 'true') {
    throw new Error('Remote tenant-isolation testing requires TENANT_ISOLATION_ALLOW_REMOTE=true');
  }
}

async function main() {
  const runtimeUrl = process.env.DATABASE_URL;
  if (!runtimeUrl) throw new Error('DATABASE_URL is required for the tenant-isolation runtime client');
  const runtimeHost = new URL(runtimeUrl).hostname;
  const localRuntime = ['127.0.0.1', 'localhost', '::1'].includes(runtimeHost);
  const adminUrl = process.env.DATABASE_ADMIN_URL || (localRuntime ? runtimeUrl : undefined);
  if (!adminUrl) throw new Error('DATABASE_ADMIN_URL is required for remote tenant-isolation setup and cleanup');
  assertSafeDatabaseTargets(adminUrl);
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  const suffix = randomUUID().replace(/-/g, '').slice(0, 10);
  const code = `T${suffix.slice(0, 6).toUpperCase()}`;
  let primaryDepartmentId;
  let testTenant;
  try {
    const primaryTenant = await admin.tenant.findUnique({
      where: { slug: process.env.DEFAULT_TENANT_SLUG || 'hgi' },
    });
    if (!primaryTenant) throw new Error('Primary tenant is missing');
    testTenant = await admin.tenant.create({
      data: { name: `Isolation Test ${suffix}`, slug: `isolation-${suffix}` },
    });

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

    const testUser = await runWithTenant(testTenant, () => prisma.user.create({
      data: {
        tenantId: primaryTenant.id,
        email: 'admin@hoterra.az',
        passwordHash: 'tenant-isolation-test-only',
        firstName: 'Isolation',
        lastName: 'User',
        departmentId: testDepartment.id,
      },
    }));
    let crossTenantPreferenceBlocked = false;
    try {
      await runWithTenant(primaryTenant, () => prisma.userNotificationPreference.create({
        data: { userId: testUser.id, emailEnabled: false },
      }));
    } catch {
      crossTenantPreferenceBlocked = true;
    }
    if (!crossTenantPreferenceBlocked) {
      throw new Error('Cross-tenant notification preference relation was not blocked');
    }

    const testNotificationPreference = await runWithTenant(testTenant, () => prisma.userNotificationPreference.create({
      data: { userId: testUser.id, emailEnabled: false },
    }));
    const testPosition = await runWithTenant(testTenant, () => prisma.workforcePosition.create({
      data: { name: `Isolation Position ${suffix}`, departmentId: testDepartment.id },
    }));
    const testDocument = await runWithTenant(testTenant, () => prisma.document.create({
      data: {
        title: `Isolation Document ${suffix}`,
        code: `ISO-DOC-${suffix}`,
        category: 'SOP',
        departmentId: testDepartment.id,
        authorId: testUser.id,
      },
    }));
    const testRequest = await runWithTenant(testTenant, () => prisma.workforceRequest.create({
      data: {
        code: `ISO-WF-${suffix}`,
        hotelName: 'Isolation Test Hotel',
        departmentId: testDepartment.id,
        positionId: testPosition.id,
        workDate: new Date(),
        endDate: new Date(),
        quantity: 1,
        createdById: testUser.id,
      },
    }));

    const leaked = await runWithTenant(primaryTenant, () => prisma.department.findUnique({
      where: { id: testDepartment.id },
    }));
    if (leaked) throw new Error('Cross-tenant read leaked a record');

    const primaryLeaks = await runWithTenant(primaryTenant, () => Promise.all([
      prisma.user.findUnique({ where: { id: testUser.id } }),
      prisma.document.findUnique({ where: { id: testDocument.id } }),
      prisma.workforcePosition.findUnique({ where: { id: testPosition.id } }),
      prisma.workforceRequest.findUnique({ where: { id: testRequest.id } }),
      prisma.userNotificationPreference.findUnique({ where: { id: testNotificationPreference.id } }),
    ]));
    if (primaryLeaks.some(Boolean)) throw new Error('Cross-tenant business object read leaked a record');

    const systemLeaks = await Promise.all([
      systemPrisma.user.findUnique({ where: { id: testUser.id } }),
      systemPrisma.document.findUnique({ where: { id: testDocument.id } }),
      systemPrisma.workforceRequest.findUnique({ where: { id: testRequest.id } }),
      systemPrisma.userNotificationPreference.findUnique({ where: { id: testNotificationPreference.id } }),
    ]);
    if (systemLeaks.some(Boolean)) throw new Error('System database client leaked tenant business data');

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

    console.log('[tenant-test] department, user, notification preferences, document, workforce, system-sentinel, write override, update, relation and tenant-scoped unique checks passed');
  } finally {
    try {
      if (primaryDepartmentId) {
        await admin.department.deleteMany({ where: { id: primaryDepartmentId } });
      }
      if (testTenant) {
        await admin.workforceRequest.deleteMany({ where: { tenantId: testTenant.id } });
        await admin.document.deleteMany({ where: { tenantId: testTenant.id } });
        await admin.workforcePosition.deleteMany({ where: { tenantId: testTenant.id } });
        await admin.user.deleteMany({ where: { tenantId: testTenant.id } });
        await admin.department.deleteMany({ where: { tenantId: testTenant.id } });
        await admin.tenant.deleteMany({ where: { id: testTenant.id } });
      }
    } finally {
      await admin.$disconnect();
      await disconnectPrisma();
    }
  }
}

main().catch((error) => {
  console.error('[tenant-test]', error);
  process.exit(1);
});
