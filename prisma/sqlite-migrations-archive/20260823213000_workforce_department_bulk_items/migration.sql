ALTER TABLE "WorkforcePosition" ADD COLUMN "departmentId" TEXT;

UPDATE "WorkforcePosition" SET "departmentId" = (SELECT "id" FROM "Department" WHERE "code" = 'KT')
WHERE "name" IN ('Butcher', 'Chef de partie', 'Commis', 'Stewarding attendant');

UPDATE "WorkforcePosition" SET "departmentId" = (SELECT "id" FROM "Department" WHERE "code" = 'HK')
WHERE "name" IN ('Housekeeping attendant', 'Laundry attendant');

UPDATE "WorkforcePosition" SET "departmentId" = (SELECT "id" FROM "Department" WHERE "code" = 'FB')
WHERE "name" IN ('Waiter banquet', 'Waiter restaurant');

ALTER TABLE "WorkforcePosition"
ADD CONSTRAINT "WorkforcePosition_departmentId_fkey"
FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "WorkforceRequestItem" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "positionId" TEXT NOT NULL,
  "rateUnit" "WorkforceRateUnit" NOT NULL,
  "quantity" INTEGER NOT NULL,
  "hours" DOUBLE PRECISION,
  "vendorRateId" TEXT,
  "vendorId" TEXT,
  "unitRate" DOUBLE PRECISION,
  "rateCurrency" TEXT DEFAULT 'AZN',
  "estimatedCost" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkforceRequestItem_pkey" PRIMARY KEY ("id")
);

INSERT INTO "WorkforceRequestItem" (
  "id", "requestId", "positionId", "rateUnit", "quantity", "vendorRateId", "vendorId", "unitRate", "rateCurrency", "estimatedCost"
)
SELECT
  md5(random()::text || clock_timestamp()::text),
  "id", "positionId", COALESCE("rateUnit", 'HOURLY'::"WorkforceRateUnit"), "quantity", "vendorRateId", "vendorId", "unitRate", "rateCurrency", "estimatedCost"
FROM "WorkforceRequest";

CREATE INDEX "WorkforceRequestItem_requestId_idx" ON "WorkforceRequestItem"("requestId");
CREATE INDEX "WorkforceRequestItem_vendorId_idx" ON "WorkforceRequestItem"("vendorId");

ALTER TABLE "WorkforceRequestItem" ADD CONSTRAINT "WorkforceRequestItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "WorkforceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkforceRequestItem" ADD CONSTRAINT "WorkforceRequestItem_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "WorkforcePosition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkforceRequestItem" ADD CONSTRAINT "WorkforceRequestItem_vendorRateId_fkey" FOREIGN KEY ("vendorRateId") REFERENCES "VendorServiceRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkforceRequestItem" ADD CONSTRAINT "WorkforceRequestItem_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
