CREATE TABLE "CustomRole" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "baseRole" "Role" NOT NULL DEFAULT 'EMPLOYEE',
    "permissions" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "CustomRole_name_key" ON "CustomRole"("name");

ALTER TABLE "User" ADD COLUMN "customRoleId" TEXT
    REFERENCES "CustomRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;
