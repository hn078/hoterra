-- AlterTable
ALTER TABLE "DocumentComment" ADD COLUMN "attachmentFileName" TEXT;
ALTER TABLE "DocumentComment" ADD COLUMN "attachmentFilePath" TEXT;
ALTER TABLE "DocumentComment" ADD COLUMN "attachmentFileSize" INTEGER;
ALTER TABLE "DocumentComment" ADD COLUMN "attachmentFileType" TEXT;
