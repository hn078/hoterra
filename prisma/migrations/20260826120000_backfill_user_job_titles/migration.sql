UPDATE "User"
SET "jobTitle" = CASE "role"::text
  WHEN 'SYSTEM_ADMINISTRATOR' THEN 'System Administrator'
  WHEN 'GENERAL_MANAGER' THEN 'General Manager'
  WHEN 'FINANCE_DIRECTOR' THEN 'Finance Director'
  WHEN 'HOD' THEN 'Head of Department'
  WHEN 'SUPERVISOR' THEN 'Supervisor'
  ELSE 'Employee'
END
WHERE "jobTitle" IS NULL;

ALTER TABLE "User" ALTER COLUMN "jobTitle" SET NOT NULL;
