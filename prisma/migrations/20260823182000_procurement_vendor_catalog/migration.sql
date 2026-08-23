CREATE TYPE "VendorApprovalStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');
CREATE TYPE "WorkforceRateUnit" AS ENUM ('HOURLY', 'DAILY_9', 'DAILY_12');

ALTER TABLE "Vendor"
  ADD COLUMN "approvalStatus" "VendorApprovalStatus" NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN "approvalSteps" TEXT NOT NULL DEFAULT '[]',
  ADD COLUMN "currentStepIndex" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "submittedById" TEXT,
  ADD COLUMN "submittedAt" TIMESTAMP(3),
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "insuranceNotes" TEXT;

CREATE TABLE "VendorServiceRate" (
  "id" TEXT NOT NULL,
  "vendorId" TEXT NOT NULL,
  "positionId" TEXT NOT NULL,
  "unit" "WorkforceRateUnit" NOT NULL,
  "price" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'AZN',
  "uom" TEXT NOT NULL DEFAULT 'Each',
  "requirements" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VendorServiceRate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VendorServiceRate_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "VendorServiceRate_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "WorkforcePosition"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "VendorServiceRate_vendorId_positionId_unit_key" ON "VendorServiceRate"("vendorId", "positionId", "unit");

CREATE TABLE "VendorApprovalEvent" (
  "id" TEXT NOT NULL,
  "vendorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "stepIndex" INTEGER,
  "role" "Role",
  "userId" TEXT,
  "userName" TEXT,
  "comment" TEXT,
  "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VendorApprovalEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VendorApprovalEvent_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "WorkforceRequest"
  ADD COLUMN "vendorRateId" TEXT,
  ADD COLUMN "rateUnit" "WorkforceRateUnit",
  ADD COLUMN "unitRate" DOUBLE PRECISION,
  ADD COLUMN "rateCurrency" TEXT DEFAULT 'AZN',
  ADD CONSTRAINT "WorkforceRequest_vendorRateId_fkey" FOREIGN KEY ("vendorRateId") REFERENCES "VendorServiceRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
