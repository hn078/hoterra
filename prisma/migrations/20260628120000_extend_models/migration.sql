-- AlterTable Department
ALTER TABLE "Department" ADD COLUMN "location" TEXT NOT NULL DEFAULT 'Main Hotel';
ALTER TABLE "Department" ADD COLUMN "description" TEXT;

-- AlterTable Document
ALTER TABLE "Document" ADD COLUMN "content" TEXT;
ALTER TABLE "Document" ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE "Document" ADD COLUMN "fileSize" INTEGER;
ALTER TABLE "Document" ADD COLUMN "archiveReason" TEXT;
ALTER TABLE "Document" ADD COLUMN "archivedAt" DATETIME;
ALTER TABLE "Document" ADD COLUMN "archivedBy" TEXT;
ALTER TABLE "Document" ADD COLUMN "allowDownload" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Document" ADD COLUMN "allowComments" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Document" ADD COLUMN "workflowId" TEXT;

-- AlterTable Template
ALTER TABLE "Template" ADD COLUMN "version" TEXT NOT NULL DEFAULT '1.0';
ALTER TABLE "Template" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'Active';
ALTER TABLE "Template" ADD COLUMN "departmentId" TEXT;
ALTER TABLE "Template" ADD COLUMN "updatedAt" DATETIME;

-- AlterTable SystemSettings
ALTER TABLE "SystemSettings" ADD COLUMN "notifyEmail" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SystemSettings" ADD COLUMN "notifyPush" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SystemSettings" ADD COLUMN "notifyInApp" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable DocumentComment
CREATE TABLE "DocumentComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentComment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DocumentComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable DocumentAttachment
CREATE TABLE "DocumentAttachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER,
    "fileType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentAttachment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DocumentComment_documentId_idx" ON "DocumentComment"("documentId");
CREATE INDEX "DocumentAttachment_documentId_idx" ON "DocumentAttachment"("documentId");

UPDATE "Template" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
