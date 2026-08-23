CREATE TABLE "WorkforceVendorCorrectionReview" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "submittedById" TEXT,
    "submittedByName" TEXT,
    "submittedAt" TIMESTAMP(3),
    "fdApprovedById" TEXT,
    "fdApprovedByName" TEXT,
    "fdApprovedAt" TIMESTAMP(3),
    "fdComment" TEXT,
    "gmApprovedById" TEXT,
    "gmApprovedByName" TEXT,
    "gmApprovedAt" TIMESTAMP(3),
    "gmComment" TEXT,
    "returnComment" TEXT,
    "returnedById" TEXT,
    "returnedByName" TEXT,
    "returnedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkforceVendorCorrectionReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkforceVendorCorrection" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "originalVendorId" TEXT,
    "originalVendorName" TEXT,
    "originalRateId" TEXT,
    "originalUnitRate" DOUBLE PRECISION,
    "originalCost" DOUBLE PRECISION,
    "proposedVendorId" TEXT NOT NULL,
    "proposedVendorName" TEXT NOT NULL,
    "proposedRateId" TEXT NOT NULL,
    "proposedUnitRate" DOUBLE PRECISION NOT NULL,
    "proposedCurrency" TEXT NOT NULL DEFAULT 'AZN',
    "proposedCost" DOUBLE PRECISION NOT NULL,
    "comment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkforceVendorCorrection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkforceVendorCorrection_reviewId_itemId_key" ON "WorkforceVendorCorrection"("reviewId", "itemId");
CREATE INDEX "WorkforceVendorCorrectionReview_requestId_status_idx" ON "WorkforceVendorCorrectionReview"("requestId", "status");
CREATE INDEX "WorkforceVendorCorrection_itemId_idx" ON "WorkforceVendorCorrection"("itemId");

ALTER TABLE "WorkforceVendorCorrectionReview"
ADD CONSTRAINT "WorkforceVendorCorrectionReview_requestId_fkey"
FOREIGN KEY ("requestId") REFERENCES "WorkforceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkforceVendorCorrection"
ADD CONSTRAINT "WorkforceVendorCorrection_reviewId_fkey"
FOREIGN KEY ("reviewId") REFERENCES "WorkforceVendorCorrectionReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkforceVendorCorrection"
ADD CONSTRAINT "WorkforceVendorCorrection_itemId_fkey"
FOREIGN KEY ("itemId") REFERENCES "WorkforceRequestItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
