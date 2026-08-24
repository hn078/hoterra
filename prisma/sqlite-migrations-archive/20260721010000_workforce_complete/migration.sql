-- AlterTable
ALTER TABLE "WorkforceSettings" ADD COLUMN "hotelsJson" TEXT NOT NULL DEFAULT '["HOTERRA"]';
ALTER TABLE "WorkforceSettings" ADD COLUMN "notifyEmail" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "WorkforceSettings" ADD COLUMN "notifyPush" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "WorkforceSettings" ADD COLUMN "payrollTolerancePct" REAL NOT NULL DEFAULT 5;

-- AlterTable
ALTER TABLE "WorkforceRequestTemplate" ADD COLUMN "isRecurring" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WorkforceRequestTemplate" ADD COLUMN "lastGeneratedAt" DATETIME;
ALTER TABLE "WorkforceRequestTemplate" ADD COLUMN "hotelName" TEXT;

-- CreateTable
CREATE TABLE "VendorInvite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" DATETIME,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "VendorInvite_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "WorkforceRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VendorInvite_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "VendorInvite_token_key" ON "VendorInvite"("token");

CREATE TABLE "VendorInvoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceHours" REAL NOT NULL,
    "invoiceAmount" REAL NOT NULL,
    "invoiceDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "matchedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VendorInvoice_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "WorkforceRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VendorInvoice_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "EmailOutbox" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
