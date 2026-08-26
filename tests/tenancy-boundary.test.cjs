require('tsx/cjs');

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizePublicTenantSlug,
  readPublicBrandingAsset,
  readPublicTenantBranding,
} = require('../server/modules/tenancy');

function databaseWith(tenant) {
  let queries = 0;
  return {
    database: {
      tenant: {
        findFirst: async (args) => {
          queries += 1;
          assert.deepEqual(args.where, { slug: 'hgi', isActive: true });
          return tenant;
        },
      },
    },
    queries: () => queries,
  };
}

test('public tenant slug validation rejects ambiguous input before database access', async () => {
  assert.equal(normalizePublicTenantSlug(' HGI '), 'hgi');
  for (const value of ['', 'api.hoterra.net', '../hgi', '-hgi', 'hgi-', 'a'.repeat(64)]) {
    assert.equal(normalizePublicTenantSlug(value), null);
  }
  const fixture = databaseWith(null);
  assert.equal(await readPublicTenantBranding(fixture.database, '../hgi'), null);
  assert.equal(fixture.queries(), 0);
});

test('public branding DTO exposes no tenant id or storage paths', async () => {
  const fixture = databaseWith({
    id: 'tenant-a',
    name: 'Hotel A',
    slug: 'hgi',
    systemSettings: {
      companyName: 'Hotel A LLC',
      loginLogoPath: '/uploads/tenant-a/branding/logo.png',
      loginBackgroundPath: '/uploads/tenant-a/branding/background.webp',
    },
  });
  const branding = await readPublicTenantBranding(fixture.database, 'HGI');
  assert.deepEqual(branding, {
    tenantName: 'Hotel A',
    companyName: 'Hotel A LLC',
    logoUrl: '/public/tenants/hgi/branding/logo?v=logo.png',
    backgroundUrl: '/public/tenants/hgi/branding/background?v=background.webp',
  });
  assert.equal('tenantId' in branding, false);
  assert.equal(JSON.stringify(branding).includes('/uploads/'), false);
});

test('public branding assets must stay inside the selected tenant branding prefix', async () => {
  const allowed = databaseWith({
    id: 'tenant-a', name: 'Hotel A', slug: 'hgi',
    systemSettings: { companyName: null, loginLogoPath: '/uploads/tenant-a/branding/logo.png', loginBackgroundPath: null },
  });
  assert.deepEqual(await readPublicBrandingAsset(allowed.database, 'hgi', 'logo'), {
    storedPath: '/uploads/tenant-a/branding/logo.png',
  });

  const escaped = databaseWith({
    id: 'tenant-a', name: 'Hotel A', slug: 'hgi',
    systemSettings: { companyName: null, loginLogoPath: '/uploads/tenant-b/branding/logo.png', loginBackgroundPath: null },
  });
  assert.equal(await readPublicBrandingAsset(escaped.database, 'hgi', 'logo'), null);
});
