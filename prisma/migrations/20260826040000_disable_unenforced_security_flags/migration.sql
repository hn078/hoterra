-- Do not claim 2FA or CIDR enforcement until the corresponding runtime
-- authentication/network controls are implemented.
ALTER TABLE "SystemSettings" ALTER COLUMN "enable2FA" SET DEFAULT false;

UPDATE "SystemSettings"
SET
  "enable2FA" = false,
  "extendedConfig" = jsonb_set(
    COALESCE(NULLIF("extendedConfig", ''), '{}')::jsonb,
    '{security}',
    COALESCE(COALESCE(NULLIF("extendedConfig", ''), '{}')::jsonb -> 'security', '{}'::jsonb)
      || '{"enable2FA": false, "ipRestrictions": []}'::jsonb,
    true
  )::text;
