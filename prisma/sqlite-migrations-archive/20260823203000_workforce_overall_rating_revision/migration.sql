ALTER TYPE "WorkforceRequestStatus" ADD VALUE IF NOT EXISTS 'RETURNED_FOR_REVISION';

ALTER TABLE "Vendor" ADD COLUMN "lowRatingAlertedAt" TIMESTAMP(3);

ALTER TABLE "WorkforceQualityEvaluation"
  ADD COLUMN "createdByRole" "Role" NOT NULL DEFAULT 'HOD',
  ALTER COLUMN "overallScore" TYPE INTEGER USING ROUND("overallScore")::INTEGER,
  DROP COLUMN "disciplineScore",
  DROP COLUMN "requirementsScore",
  DROP COLUMN "workQualityScore",
  DROP COLUMN "reliabilityScore";

ALTER TABLE "WorkforceQualityEvaluation" ALTER COLUMN "createdByRole" DROP DEFAULT;
