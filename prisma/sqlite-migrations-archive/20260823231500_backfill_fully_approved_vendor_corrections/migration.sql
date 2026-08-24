-- Vendor-correction approvals completed before the explicit ready-for-execution
-- state was introduced. Preserve their completed approval outcome.
UPDATE "WorkforceRequest" AS request
SET "status" = 'VENDORS_FULLY_APPROVED'
WHERE request."status" = 'VENDOR_ACCEPTED'
  AND EXISTS (
    SELECT 1
    FROM "WorkforceVendorCorrectionReview" AS review
    WHERE review."requestId" = request."id"
      AND review."status" = 'APPROVED'
  );
