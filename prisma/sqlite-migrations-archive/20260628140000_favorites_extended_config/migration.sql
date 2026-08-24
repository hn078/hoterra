-- AlterTable SystemSettings
ALTER TABLE "SystemSettings" ADD COLUMN "extendedConfig" TEXT NOT NULL DEFAULT '{}';

-- CreateTable UserFavorite
CREATE TABLE "UserFavorite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "UserFavorite_userId_documentId_key" ON "UserFavorite"("userId", "documentId");
