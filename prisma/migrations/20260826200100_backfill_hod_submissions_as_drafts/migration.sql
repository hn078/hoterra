-- Repair open requests created by their owning HoD that were left waiting for
-- the same HoD's redundant approval. They become drafts and must be explicitly
-- sent from the request detail screen.
UPDATE "WorkforceRequest" request
SET "status" = 'DRAFT'::"WorkforceRequestStatus",
    "currentStepIndex" = 0,
    "updatedAt" = NOW()
FROM "User" creator
WHERE creator."tenantId" = request."tenantId"
  AND creator."id" = request."createdById"
  AND request."status"::text IN ('PENDING', 'AWAITING_EXTRA_APPROVAL')
  AND request."currentStepIndex" = 0
  AND creator."isActive" = true
  AND creator."role"::text = 'HOD'
  AND creator."departmentId" = request."departmentId"
  AND request."approvalSteps"::jsonb -> 0 ->> 'role' = 'HOD'
  AND COALESCE(request."approvalSteps"::jsonb -> 0 ->> 'approverDepartmentId', request."departmentId") = request."departmentId"
  AND COALESCE(request."approvalSteps"::jsonb -> 0 ->> 'approverUserId', request."createdById") = request."createdById";
