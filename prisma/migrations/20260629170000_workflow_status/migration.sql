-- Add workflow lifecycle status (separate from isDefault)
CREATE TABLE "new_WorkflowRoute" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "steps" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "new_WorkflowRoute" ("id", "name", "description", "steps", "isDefault", "status", "createdAt")
SELECT
    "id",
    "name",
    "description",
    "steps",
    "isDefault",
    CASE WHEN "isDefault" = 1 THEN 'ACTIVE' ELSE 'DRAFT' END,
    "createdAt"
FROM "WorkflowRoute";

DROP TABLE "WorkflowRoute";
ALTER TABLE "new_WorkflowRoute" RENAME TO "WorkflowRoute";
