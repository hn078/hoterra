-- AlterTable
ALTER TABLE "Message" ADD COLUMN "attachmentFileName" TEXT;
ALTER TABLE "Message" ADD COLUMN "attachmentFilePath" TEXT;
ALTER TABLE "Message" ADD COLUMN "attachmentFileSize" INTEGER;
ALTER TABLE "Message" ADD COLUMN "attachmentFileType" TEXT;
