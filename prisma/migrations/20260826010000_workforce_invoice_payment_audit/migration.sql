ALTER TABLE "VendorInvoice"
ADD COLUMN "paidAt" TIMESTAMP(3),
ADD COLUMN "paidById" TEXT;

CREATE INDEX "VendorInvoice_tenantId_vendorId_invoiceNumber_idx"
ON "VendorInvoice"("tenantId", "vendorId", "invoiceNumber");
