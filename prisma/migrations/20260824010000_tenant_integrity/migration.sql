-- DropIndex
DROP INDEX "Conversation_directKey_key";

-- DropIndex
DROP INDEX "Conversation_type_departmentId_key";

-- DropIndex
DROP INDEX "CustomRole_name_key";

-- DropIndex
DROP INDEX "Department_code_key";

-- DropIndex
DROP INDEX "Department_name_key";

-- DropIndex
DROP INDEX "Document_code_key";

-- DropIndex
DROP INDEX "User_email_key";

-- DropIndex
DROP INDEX "Vendor_name_key";

-- DropIndex
DROP INDEX "WorkforcePosition_name_key";

-- DropIndex
DROP INDEX "WorkforceRequest_code_key";

-- AlterTable
ALTER TABLE "AuditLog" ALTER COLUMN "tenantId" SET NOT NULL,
ALTER COLUMN "tenantId" SET DEFAULT current_setting('hoterra.tenant_id', true);

-- AlterTable
ALTER TABLE "Conversation" ALTER COLUMN "tenantId" SET NOT NULL,
ALTER COLUMN "tenantId" SET DEFAULT current_setting('hoterra.tenant_id', true);

-- AlterTable
ALTER TABLE "ConversationParticipant" ALTER COLUMN "tenantId" SET NOT NULL,
ALTER COLUMN "tenantId" SET DEFAULT current_setting('hoterra.tenant_id', true);

-- AlterTable
ALTER TABLE "CustomRole" ALTER COLUMN "tenantId" SET NOT NULL,
ALTER COLUMN "tenantId" SET DEFAULT current_setting('hoterra.tenant_id', true);

-- AlterTable
ALTER TABLE "Department" ALTER COLUMN "tenantId" SET NOT NULL,
ALTER COLUMN "tenantId" SET DEFAULT current_setting('hoterra.tenant_id', true);

-- AlterTable
ALTER TABLE "DepartmentCasualBudget" ALTER COLUMN "tenantId" SET NOT NULL,
ALTER COLUMN "tenantId" SET DEFAULT current_setting('hoterra.tenant_id', true);

-- AlterTable
ALTER TABLE "Document" ALTER COLUMN "tenantId" SET NOT NULL,
ALTER COLUMN "tenantId" SET DEFAULT current_setting('hoterra.tenant_id', true);

-- AlterTable
ALTER TABLE "DocumentAttachment" ALTER COLUMN "tenantId" SET NOT NULL,
ALTER COLUMN "tenantId" SET DEFAULT current_setting('hoterra.tenant_id', true);

-- AlterTable
ALTER TABLE "DocumentComment" ALTER COLUMN "tenantId" SET NOT NULL,
ALTER COLUMN "tenantId" SET DEFAULT current_setting('hoterra.tenant_id', true);

-- AlterTable
ALTER TABLE "DocumentHistory" ALTER COLUMN "tenantId" SET NOT NULL,
ALTER COLUMN "tenantId" SET DEFAULT current_setting('hoterra.tenant_id', true);

-- AlterTable
ALTER TABLE "DocumentVersion" ALTER COLUMN "tenantId" SET NOT NULL,
ALTER COLUMN "tenantId" SET DEFAULT current_setting('hoterra.tenant_id', true);

-- AlterTable
ALTER TABLE "EmailOutbox" ALTER COLUMN "tenantId" SET NOT NULL,
ALTER COLUMN "tenantId" SET DEFAULT current_setting('hoterra.tenant_id', true);

-- AlterTable
ALTER TABLE "Message" ALTER COLUMN "tenantId" SET NOT NULL,
ALTER COLUMN "tenantId" SET DEFAULT current_setting('hoterra.tenant_id', true);

-- AlterTable
ALTER TABLE "Notification" ALTER COLUMN "tenantId" SET NOT NULL,
ALTER COLUMN "tenantId" SET DEFAULT current_setting('hoterra.tenant_id', true);

-- AlterTable
ALTER TABLE "Signature" ALTER COLUMN "tenantId" SET NOT NULL,
ALTER COLUMN "tenantId" SET DEFAULT current_setting('hoterra.tenant_id', true);

-- AlterTable
ALTER TABLE "SystemSettings" ALTER COLUMN "tenantId" SET NOT NULL,
ALTER COLUMN "tenantId" SET DEFAULT current_setting('hoterra.tenant_id', true);

-- AlterTable
ALTER TABLE "Template" ALTER COLUMN "tenantId" SET NOT NULL,
ALTER COLUMN "tenantId" SET DEFAULT current_setting('hoterra.tenant_id', true);

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "tenantId" SET NOT NULL,
ALTER COLUMN "tenantId" SET DEFAULT current_setting('hoterra.tenant_id', true);

-- AlterTable
ALTER TABLE "UserFavorite" ALTER COLUMN "tenantId" SET NOT NULL,
ALTER COLUMN "tenantId" SET DEFAULT current_setting('hoterra.tenant_id', true);

-- AlterTable
ALTER TABLE "Vendor" ALTER COLUMN "tenantId" SET NOT NULL,
ALTER COLUMN "tenantId" SET DEFAULT current_setting('hoterra.tenant_id', true);

-- AlterTable
ALTER TABLE "VendorApprovalEvent" ALTER COLUMN "tenantId" SET NOT NULL,
ALTER COLUMN "tenantId" SET DEFAULT current_setting('hoterra.tenant_id', true);

-- AlterTable
ALTER TABLE "VendorInvite" ALTER COLUMN "tenantId" SET NOT NULL,
ALTER COLUMN "tenantId" SET DEFAULT current_setting('hoterra.tenant_id', true);

-- AlterTable
ALTER TABLE "VendorInvoice" ALTER COLUMN "tenantId" SET NOT NULL,
ALTER COLUMN "tenantId" SET DEFAULT current_setting('hoterra.tenant_id', true);

-- AlterTable
ALTER TABLE "VendorServiceRate" ALTER COLUMN "tenantId" SET NOT NULL,
ALTER COLUMN "tenantId" SET DEFAULT current_setting('hoterra.tenant_id', true);

-- AlterTable
ALTER TABLE "WorkflowRoute" ALTER COLUMN "tenantId" SET NOT NULL,
ALTER COLUMN "tenantId" SET DEFAULT current_setting('hoterra.tenant_id', true);

-- AlterTable
ALTER TABLE "WorkforceApprovalRoute" ALTER COLUMN "tenantId" SET NOT NULL,
ALTER COLUMN "tenantId" SET DEFAULT current_setting('hoterra.tenant_id', true);

-- AlterTable
ALTER TABLE "WorkforcePosition" ALTER COLUMN "tenantId" SET NOT NULL,
ALTER COLUMN "tenantId" SET DEFAULT current_setting('hoterra.tenant_id', true);

-- AlterTable
ALTER TABLE "WorkforceQualityEvaluation" ALTER COLUMN "tenantId" SET NOT NULL,
ALTER COLUMN "tenantId" SET DEFAULT current_setting('hoterra.tenant_id', true);

-- AlterTable
ALTER TABLE "WorkforceRequest" ALTER COLUMN "tenantId" SET NOT NULL,
ALTER COLUMN "tenantId" SET DEFAULT current_setting('hoterra.tenant_id', true);

-- AlterTable
ALTER TABLE "WorkforceRequestEvent" ALTER COLUMN "tenantId" SET NOT NULL,
ALTER COLUMN "tenantId" SET DEFAULT current_setting('hoterra.tenant_id', true);

-- AlterTable
ALTER TABLE "WorkforceRequestItem" ALTER COLUMN "tenantId" SET NOT NULL,
ALTER COLUMN "tenantId" SET DEFAULT current_setting('hoterra.tenant_id', true);

-- AlterTable
ALTER TABLE "WorkforceRequestTemplate" ALTER COLUMN "tenantId" SET NOT NULL,
ALTER COLUMN "tenantId" SET DEFAULT current_setting('hoterra.tenant_id', true);

-- AlterTable
ALTER TABLE "WorkforceSettings" ALTER COLUMN "tenantId" SET NOT NULL,
ALTER COLUMN "tenantId" SET DEFAULT current_setting('hoterra.tenant_id', true);

-- AlterTable
ALTER TABLE "WorkforceVendorCorrection" ALTER COLUMN "tenantId" SET NOT NULL,
ALTER COLUMN "tenantId" SET DEFAULT current_setting('hoterra.tenant_id', true);

-- AlterTable
ALTER TABLE "WorkforceVendorCorrectionReview" ALTER COLUMN "tenantId" SET NOT NULL,
ALTER COLUMN "tenantId" SET DEFAULT current_setting('hoterra.tenant_id', true);

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_tenantId_directKey_key" ON "Conversation"("tenantId", "directKey");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_tenantId_type_departmentId_key" ON "Conversation"("tenantId", "type", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomRole_tenantId_name_key" ON "CustomRole"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Department_tenantId_name_key" ON "Department"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Department_tenantId_code_key" ON "Department"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Document_tenantId_code_key" ON "Document"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_tenantId_name_key" ON "Vendor"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "WorkforcePosition_tenantId_name_key" ON "WorkforcePosition"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "WorkforceRequest_tenantId_code_key" ON "WorkforceRequest"("tenantId", "code");

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomRole" ADD CONSTRAINT "CustomRole_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentHistory" ADD CONSTRAINT "DocumentHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentComment" ADD CONSTRAINT "DocumentComment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRoute" ADD CONSTRAINT "WorkflowRoute_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signature" ADD CONSTRAINT "Signature_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemSettings" ADD CONSTRAINT "SystemSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFavorite" ADD CONSTRAINT "UserFavorite_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkforcePosition" ADD CONSTRAINT "WorkforcePosition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorServiceRate" ADD CONSTRAINT "VendorServiceRate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorApprovalEvent" ADD CONSTRAINT "VendorApprovalEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkforceApprovalRoute" ADD CONSTRAINT "WorkforceApprovalRoute_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentCasualBudget" ADD CONSTRAINT "DepartmentCasualBudget_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkforceSettings" ADD CONSTRAINT "WorkforceSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkforceRequest" ADD CONSTRAINT "WorkforceRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkforceRequestItem" ADD CONSTRAINT "WorkforceRequestItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkforceVendorCorrectionReview" ADD CONSTRAINT "WorkforceVendorCorrectionReview_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkforceVendorCorrection" ADD CONSTRAINT "WorkforceVendorCorrection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkforceQualityEvaluation" ADD CONSTRAINT "WorkforceQualityEvaluation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkforceRequestEvent" ADD CONSTRAINT "WorkforceRequestEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkforceRequestTemplate" ADD CONSTRAINT "WorkforceRequestTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorInvite" ADD CONSTRAINT "VendorInvite_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorInvoice" ADD CONSTRAINT "VendorInvoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailOutbox" ADD CONSTRAINT "EmailOutbox_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
