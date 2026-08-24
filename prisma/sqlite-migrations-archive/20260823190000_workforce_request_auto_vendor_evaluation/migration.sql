ALTER TYPE "WorkforceRequestStatus" ADD VALUE IF NOT EXISTS 'PROCUREMENT_REVIEW';
ALTER TYPE "WorkforceRequestStatus" ADD VALUE IF NOT EXISTS 'PROCUREMENT_CONFIRMED';
ALTER TYPE "WorkforceRequestStatus" ADD VALUE IF NOT EXISTS 'IN_SERVICE';
ALTER TYPE "WorkforceRequestStatus" ADD VALUE IF NOT EXISTS 'AWAITING_EVALUATION';

CREATE TYPE "WorkforceEvaluationPhase" AS ENUM ('ONGOING', 'FINAL');

ALTER TABLE "Vendor" ADD COLUMN "replacementRequested" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "WorkforceRequest" ADD COLUMN "endDate" TIMESTAMP(3);
UPDATE "WorkforceRequest" SET "endDate" = "workDate" WHERE "endDate" IS NULL;
ALTER TABLE "WorkforceRequest" ALTER COLUMN "endDate" SET NOT NULL;

CREATE TABLE "WorkforceQualityEvaluation" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "phase" "WorkforceEvaluationPhase" NOT NULL,
    "disciplineScore" INTEGER NOT NULL,
    "requirementsScore" INTEGER NOT NULL,
    "workQualityScore" INTEGER NOT NULL,
    "reliabilityScore" INTEGER NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "replacementRecommended" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkforceQualityEvaluation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WorkforceQualityEvaluation"
ADD CONSTRAINT "WorkforceQualityEvaluation_requestId_fkey"
FOREIGN KEY ("requestId") REFERENCES "WorkforceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkforceQualityEvaluation"
ADD CONSTRAINT "WorkforceQualityEvaluation_vendorId_fkey"
FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
