BEGIN;

DELETE FROM "WorkforceRequest";
DELETE FROM "WorkforceRequestTemplate";
DELETE FROM "DepartmentCasualBudget";
DELETE FROM "Notification" WHERE "type" = 'workforce';
DELETE FROM "EmailOutbox" WHERE "entityType" IN ('WorkforceRequest', 'Vendor');

DELETE FROM "Vendor"
WHERE "name" NOT IN (
  'Plain Service',
  'AIMConsulting',
  'Pey Service',
  'Elite Outsource F/Ş',
  'Əliyev Tural F/Ş',
  'Rizalli Catering',
  'Global təmizlik şirkəti MMC'
);

DELETE FROM "WorkforcePosition" AS position
WHERE NOT EXISTS (
  SELECT 1 FROM "VendorServiceRate" AS rate
  WHERE rate."positionId" = position."id"
);

UPDATE "VendorServiceRate"
SET "price" = ROUND("price"::numeric, 2)::double precision;

COMMIT;
