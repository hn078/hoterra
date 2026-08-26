require('tsx/cjs');

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { passwordPolicyViolation } = require('../server/modules/settings/application/passwordPolicy.ts');

function source(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');
}

test('settings reads are side-effect free and redact security configuration', () => {
  const readModel = source('server/modules/settings/application/settingsReadModel.ts');
  assert.doesNotMatch(readModel, /systemSettings\.create/);
  assert.match(readModel, /settings\.manage\.security/);
  assert.match(readModel, /BUSINESS_EXTENDED_SECTIONS/);
});

test('business and security writes use separate capability-gated adapters', () => {
  const business = source('server/routes/settingsBusiness.ts');
  const security = source('server/routes/settingsSecurity.ts');
  assert.match(business, /settings\.manage\.business/);
  assert.doesNotMatch(business, /settings\.manage\.security/);
  assert.match(security, /settings\.manage\.security/);
  assert.match(security, /router\.put\('\/security'/);
});

test('business settings cannot merge security-owned extended sections', () => {
  const service = source('server/modules/settings/application/manageBusinessSettings.ts');
  assert.match(service, /BUSINESS_EXTENDED_SECTIONS/);
  assert.doesNotMatch(service, /SECURITY_EXTENDED_SECTIONS/);
  assert.doesNotMatch(service, /enable2FA.*data\[/s);
});

test('branding replacement compensates failed persistence and audits atomically', () => {
  const service = source('server/modules/settings/application/manageBranding.ts');
  assert.match(service, /database\.\$transaction/);
  assert.match(service, /auditLog\.create/);
  assert.match(service, /storage\.remove\(saved\.filePath\)/);
});

test('extended config parsing clones defaults instead of sharing mutable state', () => {
  const extended = source('server/modules/settings/domain/extendedConfig.ts');
  assert.match(extended, /deepClone\(DEFAULT_EXTENDED_CONFIG\)/);
  assert.match(extended, /const out = deepClone\(base\)/);
});

test('password policy levels enforce configured length and composition', () => {
  const base = { minLength: 10, maxLength: 128 };
  assert.equal(passwordPolicyViolation('abcdefghij', { ...base, level: 'Basic' }), null);
  assert.match(passwordPolicyViolation('abcdefghij', { ...base, level: 'Strong' }), /uppercase/);
  assert.equal(passwordPolicyViolation('Abcdefgh12', { ...base, level: 'Strong' }), null);
  assert.match(passwordPolicyViolation('Abcdefgh12', { ...base, level: 'Enterprise' }), /special/);
  assert.equal(passwordPolicyViolation('Abcdefgh1!', { ...base, level: 'Enterprise' }), null);
  assert.match(passwordPolicyViolation('Short1!', { ...base, level: 'Enterprise' }), /10–128/);
});

test('identity account creation and password reset use the tenant password policy', () => {
  const identity = source('server/modules/identity/application/manageUserAccounts.ts');
  const route = source('server/routes/userAccounts.ts');
  assert.equal((identity.match(/getTenantPasswordPolicy\(database\)/g) || []).length, 2);
  assert.equal((identity.match(/passwordPolicyViolation\(password, passwordPolicy\)/g) || []).length, 2);
  assert.match(route, /error\.detail \|\| 'Password does not meet the tenant security policy'/);
});

test('unenforced 2FA and IP controls fail closed instead of claiming protection', () => {
  const defaults = source('server/modules/settings/domain/extendedConfig.ts');
  const readModel = source('server/modules/settings/application/settingsReadModel.ts');
  const security = source('server/modules/settings/application/manageSecuritySettings.ts');
  const page = source('src/pages/SettingsPage.tsx');
  const migration = source('prisma/migrations/20260826040000_disable_unenforced_security_flags/migration.sql');
  assert.match(defaults, /enable2FA: false/);
  assert.match(defaults, /ipRestrictions: \[\]/);
  assert.match(readModel, /enable2FA: false, ipRestrictions: \[\]/);
  assert.match(security, /extended\.security = \{ \.\.\.extended\.security, enable2FA: false, ipRestrictions: \[\] \}/);
  assert.doesNotMatch(page, /SwitchRow label="Enable 2FA"/);
  assert.match(page, /Not configured — connect an MFA\/SSO provider/);
  assert.match(page, /no CIDR allowlist is currently enforced/);
  assert.match(migration, /ALTER COLUMN "enable2FA" SET DEFAULT false/);
  assert.match(migration, /"ipRestrictions": \[\]/);
});

test('login page exposes only implemented authentication and verified security claims', () => {
  const loginPage = source('src/pages/LoginPage.tsx');
  assert.doesNotMatch(loginPage, /Microsoft 365/);
  assert.doesNotMatch(loginPage, /Google SSO/);
  assert.doesNotMatch(loginPage, /ISO 27001/);
  assert.doesNotMatch(loginPage, /GDPR Compliant/);
  assert.doesNotMatch(loginPage, /setSsoMessage/);
  assert.match(loginPage, /Tenant-isolated access/);
  assert.match(loginPage, /Audited activity/);
  assert.match(loginPage, /type="submit"/);
  assert.match(loginPage, /Interface language: English/);
});
