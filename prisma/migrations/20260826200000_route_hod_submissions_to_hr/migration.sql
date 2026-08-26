-- A request submitted by the owning department HoD is itself the department
-- approval. Advance qualifying open requests to the mandatory HR HoD step and
-- repair the missing actionable notification.
CREATE TEMP TABLE hoterra_hod_submissions_to_advance ON COMMIT DROP AS
SELECT
  request."id",
  request."tenantId",
  request."code",
  request."createdById",
  creator."firstName",
  creator."lastName",
  request."approvalSteps"::jsonb -> 1 ->> 'approverDepartmentId' AS "hrDepartmentId"
FROM "WorkforceRequest" request
JOIN "User" creator
  ON creator."tenantId" = request."tenantId"
 AND creator."id" = request."createdById"
WHERE request."status"::text IN ('PENDING', 'AWAITING_EXTRA_APPROVAL')
  AND request."currentStepIndex" = 0
  AND creator."isActive" = true
  AND creator."role"::text = 'HOD'
  AND creator."departmentId" = request."departmentId"
  AND request."approvalSteps"::jsonb -> 0 ->> 'role' = 'HOD'
  AND COALESCE(request."approvalSteps"::jsonb -> 0 ->> 'approverDepartmentId', request."departmentId") = request."departmentId"
  AND COALESCE(request."approvalSteps"::jsonb -> 0 ->> 'approverUserId', request."createdById") = request."createdById"
  AND request."approvalSteps"::jsonb -> 1 ->> 'role' = 'HOD'
  AND request."approvalSteps"::jsonb -> 1 ->> 'approverDepartmentId' IS NOT NULL;

UPDATE "WorkforceRequest" request
SET "currentStepIndex" = 1,
    "updatedAt" = NOW()
FROM hoterra_hod_submissions_to_advance repair
WHERE request."tenantId" = repair."tenantId"
  AND request."id" = repair."id";

INSERT INTO "WorkforceRequestEvent" (
  "id", "tenantId", "requestId", "action", "details", "userId", "userName", "createdAt"
)
SELECT
  gen_random_uuid()::text,
  repair."tenantId",
  repair."id",
  'HOD_SUBMITTED_TO_HR',
  'Department HoD submission counted as department approval; advanced to Human Resources HoD',
  repair."createdById",
  concat_ws(' ', repair."firstName", repair."lastName"),
  NOW()
FROM hoterra_hod_submissions_to_advance repair;

INSERT INTO "Notification" (
  "id", "tenantId", "userId", "title", "message", "type", "isRead", "link",
  "entityType", "entityId", "actionType", "dedupeKey", "createdAt"
)
SELECT
  gen_random_uuid()::text,
  repair."tenantId",
  approver."id",
  'Casual staff approval required',
  'Request ' || repair."code" || ' needs your approval (Human Resources — Head of Department)',
  'workforce',
  false,
  '/workforce/' || repair."id",
  'WorkforceRequest',
  repair."id",
  'WORKFORCE_APPROVAL',
  'workforce-approval:' || repair."id" || ':1:' || approver."id",
  NOW()
FROM hoterra_hod_submissions_to_advance repair
JOIN "User" approver
  ON approver."tenantId" = repair."tenantId"
 AND approver."departmentId" = repair."hrDepartmentId"
 AND approver."role"::text = 'HOD'
 AND approver."isActive" = true
WHERE NOT EXISTS (
  SELECT 1 FROM "WorkforceSettings" settings
  WHERE settings."tenantId" = repair."tenantId" AND settings."notifyPush" = false
)
ON CONFLICT ("tenantId", "dedupeKey") DO NOTHING;

INSERT INTO "AuditLog" (
  "id", "tenantId", "userId", "userName", "action", "entityType", "entityId",
  "details", "outcome", "reason", "createdAt"
)
SELECT
  gen_random_uuid()::text,
  repair."tenantId",
  repair."createdById",
  concat_ws(' ', repair."firstName", repair."lastName"),
  'UPDATE'::"AuditAction",
  'WorkforceRequest',
  repair."id",
  'Advanced ' || repair."code" || ' from redundant department HoD approval to Human Resources HoD',
  'SUCCESS',
  'The owning department HoD created the request, so submission constitutes department approval',
  NOW()
FROM hoterra_hod_submissions_to_advance repair;
