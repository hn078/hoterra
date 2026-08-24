-- AlterTable
ALTER TABLE "User" ADD COLUMN "signatureImage" TEXT;

-- AlterTable
ALTER TABLE "Template" ADD COLUMN "signaturePlacement" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Template" ADD COLUMN "pageCount" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN "signaturePlacement" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Document" ADD COLUMN "pageCount" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Signature" ADD COLUMN "imagePath" TEXT;
ALTER TABLE "Signature" ADD COLUMN "placementId" TEXT;
ALTER TABLE "Signature" ADD COLUMN "page" INTEGER;
