-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."AuditAction" AS ENUM ('LOGIN', 'LOGOUT', 'VIEW', 'DOWNLOAD', 'PRINT', 'CREATE', 'UPDATE', 'DELETE', 'SIGN', 'PUBLISH', 'UNPUBLISH', 'ARCHIVE', 'APPROVE', 'REJECT', 'SUBMIT');

-- CreateEnum
CREATE TYPE "public"."ConversationType" AS ENUM ('DIRECT', 'DEPARTMENT', 'HOTEL');

-- CreateEnum
CREATE TYPE "public"."DocumentCategory" AS ENUM ('POLICIES', 'SOP', 'FORMS', 'CHECKLISTS', 'TEMPLATES', 'REPORTS', 'CONTRACTS', 'TRAINING_MATERIALS', 'ARCHIVE');

-- CreateEnum
CREATE TYPE "public"."DocumentPriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "public"."DocumentStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'SIGNED_HOD', 'SIGNED_FINANCE', 'SIGNED_GM', 'PUBLISHED', 'REJECTED', 'ARCHIVED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('EMPLOYEE', 'SUPERVISOR', 'HOD', 'FINANCE_DIRECTOR', 'GENERAL_MANAGER', 'SYSTEM_ADMINISTRATOR');

-- CreateEnum
CREATE TYPE "public"."VendorApprovalStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."WorkflowStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."WorkforceEvaluationPhase" AS ENUM ('ONGOING', 'FINAL');

-- CreateEnum
CREATE TYPE "public"."WorkforceRateUnit" AS ENUM ('HOURLY', 'DAILY_9', 'DAILY_12');

-- CreateEnum
CREATE TYPE "public"."WorkforceRequestStatus" AS ENUM ('PENDING', 'AWAITING_EXTRA_APPROVAL', 'APPROVED', 'REJECTED', 'SENT_TO_VENDOR', 'VENDOR_ACCEPTED', 'VENDOR_DECLINED', 'COMPLETED', 'CANCELLED', 'PROCUREMENT_REVIEW', 'PROCUREMENT_CONFIRMED', 'IN_SERVICE', 'AWAITING_EVALUATION', 'RETURNED_FOR_REVISION', 'VENDORS_FULLY_APPROVED');

-- CreateEnum
CREATE TYPE "public"."WorkforceShift" AS ENUM ('MORNING', 'EVENING', 'NIGHT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "public"."WorkforceVendorMode" AS ENUM ('DIRECT', 'BROADCAST');

-- CreateTable
CREATE TABLE "public"."AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "action" "public"."AuditAction" NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "details" TEXT,
    "ipAddress" TEXT,
    "device" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Conversation" (
    "id" TEXT NOT NULL,
    "type" "public"."ConversationType" NOT NULL,
    "departmentId" TEXT,
    "directKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ConversationParticipant" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT,

    CONSTRAINT "ConversationParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CustomRole" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "baseRole" "public"."Role" NOT NULL DEFAULT 'EMPLOYEE',
    "permissions" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT,

    CONSTRAINT "CustomRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#294660',
    "location" TEXT NOT NULL DEFAULT 'Main Hotel',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DepartmentCasualBudget" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "budgetAmount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT,

    CONSTRAINT "DepartmentCasualBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Document" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "description" TEXT,
    "content" TEXT,
    "status" "public"."DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "category" "public"."DocumentCategory" NOT NULL,
    "priority" "public"."DocumentPriority" NOT NULL DEFAULT 'MEDIUM',
    "language" TEXT NOT NULL DEFAULT 'English',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "filePath" TEXT,
    "fileName" TEXT,
    "fileType" TEXT,
    "fileSize" INTEGER,
    "nextReviewDate" TIMESTAMP(3),
    "effectiveDate" TIMESTAMP(3),
    "archiveReason" TEXT,
    "archivedAt" TIMESTAMP(3),
    "archivedBy" TEXT,
    "allowDownload" BOOLEAN NOT NULL DEFAULT true,
    "allowComments" BOOLEAN NOT NULL DEFAULT true,
    "departmentId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "ownerId" TEXT,
    "templateId" TEXT,
    "workflowId" TEXT,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "signaturePlacement" TEXT NOT NULL DEFAULT '[]',
    "pageCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DocumentAttachment" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER,
    "fileType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT,

    CONSTRAINT "DocumentAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DocumentComment" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "attachedDocumentId" TEXT,
    "attachmentFileName" TEXT,
    "attachmentFilePath" TEXT,
    "attachmentFileSize" INTEGER,
    "attachmentFileType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT,

    CONSTRAINT "DocumentComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DocumentHistory" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "userId" TEXT,
    "userName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT,

    CONSTRAINT "DocumentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "filePath" TEXT,
    "changeNote" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EmailOutbox" (
    "id" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT,

    CONSTRAINT "EmailOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "documentId" TEXT,
    "attachmentFileName" TEXT,
    "attachmentFilePath" TEXT,
    "attachmentFileSize" INTEGER,
    "attachmentFileType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "link" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Signature" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "device" TEXT,
    "docHash" TEXT,
    "imagePath" TEXT,
    "placementId" TEXT,
    "page" INTEGER,
    "tenantId" TEXT,

    CONSTRAINT "Signature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SystemSettings" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL DEFAULT 'HOTERRA Hotels & Resorts',
    "companyAddress" TEXT NOT NULL DEFAULT 'Baku, Azerbaijan',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Baku',
    "dateFormat" TEXT NOT NULL DEFAULT 'DD MMM YYYY',
    "timeFormat" TEXT NOT NULL DEFAULT '24h',
    "systemLanguage" TEXT NOT NULL DEFAULT 'en',
    "enableVersioning" BOOLEAN NOT NULL DEFAULT true,
    "mandatoryReviewDate" BOOLEAN NOT NULL DEFAULT true,
    "requireDescription" BOOLEAN NOT NULL DEFAULT false,
    "allowDownload" BOOLEAN NOT NULL DEFAULT true,
    "autoLogoutMinutes" INTEGER NOT NULL DEFAULT 30,
    "recordsPerPage" INTEGER NOT NULL DEFAULT 20,
    "enable2FA" BOOLEAN NOT NULL DEFAULT true,
    "allowComments" BOOLEAN NOT NULL DEFAULT true,
    "showTooltips" BOOLEAN NOT NULL DEFAULT true,
    "defaultStartPage" TEXT NOT NULL DEFAULT 'dashboard',
    "defaultDocSort" TEXT NOT NULL DEFAULT 'updated_desc',
    "defaultDocStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "notifyEmail" BOOLEAN NOT NULL DEFAULT true,
    "notifyPush" BOOLEAN NOT NULL DEFAULT true,
    "notifyInApp" BOOLEAN NOT NULL DEFAULT true,
    "extendedConfig" TEXT NOT NULL DEFAULT '{}',
    "tenantId" TEXT,

    CONSTRAINT "SystemSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Template" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "public"."DocumentCategory" NOT NULL,
    "content" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "status" TEXT NOT NULL DEFAULT 'Active',
    "departmentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "signaturePlacement" TEXT NOT NULL DEFAULT '[]',
    "pageCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "pinHash" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "public"."Role" NOT NULL DEFAULT 'EMPLOYEE',
    "customRoleId" TEXT,
    "departmentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "signatureImage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserFavorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT,

    CONSTRAINT "UserFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Vendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactEmail" TEXT,
    "phone" TEXT,
    "isApproved" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvalStatus" "public"."VendorApprovalStatus" NOT NULL DEFAULT 'APPROVED',
    "approvalSteps" TEXT NOT NULL DEFAULT '[]',
    "approvedAt" TIMESTAMP(3),
    "currentStepIndex" INTEGER NOT NULL DEFAULT 0,
    "insuranceNotes" TEXT,
    "rejectionReason" TEXT,
    "submittedAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "replacementRequested" BOOLEAN NOT NULL DEFAULT false,
    "lowRatingAlertedAt" TIMESTAMP(3),
    "tenantId" TEXT,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VendorApprovalEvent" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "stepIndex" INTEGER,
    "role" "public"."Role",
    "userId" TEXT,
    "userName" TEXT,
    "comment" TEXT,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT,

    CONSTRAINT "VendorApprovalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VendorInvite" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT,

    CONSTRAINT "VendorInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VendorInvoice" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceHours" DOUBLE PRECISION NOT NULL,
    "invoiceAmount" DOUBLE PRECISION NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "matchedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT,

    CONSTRAINT "VendorInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VendorServiceRate" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "unit" "public"."WorkforceRateUnit" NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AZN',
    "uom" TEXT NOT NULL DEFAULT 'Each',
    "requirements" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT,

    CONSTRAINT "VendorServiceRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkflowRoute" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "steps" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" "public"."WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT,

    CONSTRAINT "WorkflowRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkforceApprovalRoute" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "steps" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT,

    CONSTRAINT "WorkforceApprovalRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkforcePosition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "departmentId" TEXT,
    "tenantId" TEXT,

    CONSTRAINT "WorkforcePosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkforceQualityEvaluation" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "phase" "public"."WorkforceEvaluationPhase" NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "notes" TEXT,
    "replacementRecommended" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByRole" "public"."Role" NOT NULL,
    "tenantId" TEXT,

    CONSTRAINT "WorkforceQualityEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkforceRequest" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "hotelName" TEXT NOT NULL DEFAULT 'HOTERRA',
    "departmentId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "workDate" TIMESTAMP(3) NOT NULL,
    "shift" "public"."WorkforceShift" NOT NULL DEFAULT 'MORNING',
    "startTime" TEXT,
    "endTime" TEXT,
    "quantity" INTEGER NOT NULL,
    "comment" TEXT,
    "vendorMode" "public"."WorkforceVendorMode" NOT NULL DEFAULT 'DIRECT',
    "vendorId" TEXT,
    "acceptedVendorId" TEXT,
    "broadcastVendorIds" TEXT NOT NULL DEFAULT '[]',
    "status" "public"."WorkforceRequestStatus" NOT NULL DEFAULT 'PENDING',
    "currentStepIndex" INTEGER NOT NULL DEFAULT 0,
    "approvalSteps" TEXT NOT NULL DEFAULT '[]',
    "needsExtraApproval" BOOLEAN NOT NULL DEFAULT false,
    "isUrgentOverride" BOOLEAN NOT NULL DEFAULT false,
    "estimatedCost" DOUBLE PRECISION,
    "createdById" TEXT NOT NULL,
    "actualQuantity" INTEGER,
    "actualHours" DOUBLE PRECISION,
    "actualCost" DOUBLE PRECISION,
    "hodConfirmedAt" TIMESTAMP(3),
    "hodConfirmedById" TEXT,
    "financeConfirmedAt" TIMESTAMP(3),
    "financeConfirmedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "rateCurrency" TEXT DEFAULT 'AZN',
    "rateUnit" "public"."WorkforceRateUnit",
    "unitRate" DOUBLE PRECISION,
    "vendorRateId" TEXT,
    "endDate" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT,

    CONSTRAINT "WorkforceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkforceRequestEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "userId" TEXT,
    "userName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT,

    CONSTRAINT "WorkforceRequestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkforceRequestItem" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "rateUnit" "public"."WorkforceRateUnit" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "hours" DOUBLE PRECISION,
    "vendorRateId" TEXT,
    "vendorId" TEXT,
    "unitRate" DOUBLE PRECISION,
    "rateCurrency" TEXT DEFAULT 'AZN',
    "estimatedCost" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT,

    CONSTRAINT "WorkforceRequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkforceRequestTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "departmentId" TEXT,
    "positionId" TEXT,
    "shift" "public"."WorkforceShift" NOT NULL DEFAULT 'MORNING',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "comment" TEXT,
    "dayOfWeek" INTEGER,
    "vendorMode" "public"."WorkforceVendorMode" NOT NULL DEFAULT 'DIRECT',
    "vendorId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "lastGeneratedAt" TIMESTAMP(3),
    "hotelName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT,

    CONSTRAINT "WorkforceRequestTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkforceSettings" (
    "id" TEXT NOT NULL,
    "hotelName" TEXT NOT NULL DEFAULT 'HOTERRA',
    "hotelsJson" TEXT NOT NULL DEFAULT '["HOTERRA"]',
    "minLeadHours" INTEGER NOT NULL DEFAULT 24,
    "estimatedHourlyRate" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "estimatedHoursPerShift" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "notifyEmail" BOOLEAN NOT NULL DEFAULT true,
    "notifyPush" BOOLEAN NOT NULL DEFAULT true,
    "payrollTolerancePct" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "tenantId" TEXT,

    CONSTRAINT "WorkforceSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkforceVendorCorrection" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "originalVendorId" TEXT,
    "originalVendorName" TEXT,
    "originalRateId" TEXT,
    "originalUnitRate" DOUBLE PRECISION,
    "originalCost" DOUBLE PRECISION,
    "proposedVendorId" TEXT NOT NULL,
    "proposedVendorName" TEXT NOT NULL,
    "proposedRateId" TEXT NOT NULL,
    "proposedUnitRate" DOUBLE PRECISION NOT NULL,
    "proposedCurrency" TEXT NOT NULL DEFAULT 'AZN',
    "proposedCost" DOUBLE PRECISION NOT NULL,
    "comment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT,

    CONSTRAINT "WorkforceVendorCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkforceVendorCorrectionReview" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "submittedById" TEXT,
    "submittedByName" TEXT,
    "submittedAt" TIMESTAMP(3),
    "fdApprovedById" TEXT,
    "fdApprovedByName" TEXT,
    "fdApprovedAt" TIMESTAMP(3),
    "fdComment" TEXT,
    "gmApprovedById" TEXT,
    "gmApprovedByName" TEXT,
    "gmApprovedAt" TIMESTAMP(3),
    "gmComment" TEXT,
    "returnComment" TEXT,
    "returnedById" TEXT,
    "returnedByName" TEXT,
    "returnedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT,

    CONSTRAINT "WorkforceVendorCorrectionReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_idx" ON "public"."AuditLog"("tenantId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_directKey_key" ON "public"."Conversation"("directKey" ASC);

-- CreateIndex
CREATE INDEX "Conversation_tenantId_idx" ON "public"."Conversation"("tenantId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_type_departmentId_key" ON "public"."Conversation"("type" ASC, "departmentId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ConversationParticipant_conversationId_userId_key" ON "public"."ConversationParticipant"("conversationId" ASC, "userId" ASC);

-- CreateIndex
CREATE INDEX "ConversationParticipant_tenantId_idx" ON "public"."ConversationParticipant"("tenantId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "CustomRole_name_key" ON "public"."CustomRole"("name" ASC);

-- CreateIndex
CREATE INDEX "CustomRole_tenantId_idx" ON "public"."CustomRole"("tenantId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Department_code_key" ON "public"."Department"("code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_key" ON "public"."Department"("name" ASC);

-- CreateIndex
CREATE INDEX "Department_tenantId_idx" ON "public"."Department"("tenantId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentCasualBudget_departmentId_year_month_key" ON "public"."DepartmentCasualBudget"("departmentId" ASC, "year" ASC, "month" ASC);

-- CreateIndex
CREATE INDEX "DepartmentCasualBudget_tenantId_idx" ON "public"."DepartmentCasualBudget"("tenantId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Document_code_key" ON "public"."Document"("code" ASC);

-- CreateIndex
CREATE INDEX "Document_tenantId_idx" ON "public"."Document"("tenantId" ASC);

-- CreateIndex
CREATE INDEX "DocumentAttachment_tenantId_idx" ON "public"."DocumentAttachment"("tenantId" ASC);

-- CreateIndex
CREATE INDEX "DocumentComment_tenantId_idx" ON "public"."DocumentComment"("tenantId" ASC);

-- CreateIndex
CREATE INDEX "DocumentHistory_tenantId_idx" ON "public"."DocumentHistory"("tenantId" ASC);

-- CreateIndex
CREATE INDEX "DocumentVersion_tenantId_idx" ON "public"."DocumentVersion"("tenantId" ASC);

-- CreateIndex
CREATE INDEX "EmailOutbox_tenantId_idx" ON "public"."EmailOutbox"("tenantId" ASC);

-- CreateIndex
CREATE INDEX "Message_tenantId_idx" ON "public"."Message"("tenantId" ASC);

-- CreateIndex
CREATE INDEX "Notification_tenantId_idx" ON "public"."Notification"("tenantId" ASC);

-- CreateIndex
CREATE INDEX "Signature_tenantId_idx" ON "public"."Signature"("tenantId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "SystemSettings_tenantId_key" ON "public"."SystemSettings"("tenantId" ASC);

-- CreateIndex
CREATE INDEX "Template_tenantId_idx" ON "public"."Template"("tenantId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "public"."Tenant"("slug" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email" ASC);

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "public"."User"("tenantId" ASC);

-- CreateIndex
CREATE INDEX "UserFavorite_tenantId_idx" ON "public"."UserFavorite"("tenantId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "UserFavorite_userId_documentId_key" ON "public"."UserFavorite"("userId" ASC, "documentId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_name_key" ON "public"."Vendor"("name" ASC);

-- CreateIndex
CREATE INDEX "Vendor_tenantId_idx" ON "public"."Vendor"("tenantId" ASC);

-- CreateIndex
CREATE INDEX "VendorApprovalEvent_tenantId_idx" ON "public"."VendorApprovalEvent"("tenantId" ASC);

-- CreateIndex
CREATE INDEX "VendorInvite_tenantId_idx" ON "public"."VendorInvite"("tenantId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "VendorInvite_token_key" ON "public"."VendorInvite"("token" ASC);

-- CreateIndex
CREATE INDEX "VendorInvoice_tenantId_idx" ON "public"."VendorInvoice"("tenantId" ASC);

-- CreateIndex
CREATE INDEX "VendorServiceRate_tenantId_idx" ON "public"."VendorServiceRate"("tenantId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "VendorServiceRate_vendorId_positionId_unit_key" ON "public"."VendorServiceRate"("vendorId" ASC, "positionId" ASC, "unit" ASC);

-- CreateIndex
CREATE INDEX "WorkflowRoute_tenantId_idx" ON "public"."WorkflowRoute"("tenantId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "WorkforceApprovalRoute_departmentId_key" ON "public"."WorkforceApprovalRoute"("departmentId" ASC);

-- CreateIndex
CREATE INDEX "WorkforceApprovalRoute_tenantId_idx" ON "public"."WorkforceApprovalRoute"("tenantId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "WorkforcePosition_name_key" ON "public"."WorkforcePosition"("name" ASC);

-- CreateIndex
CREATE INDEX "WorkforcePosition_tenantId_idx" ON "public"."WorkforcePosition"("tenantId" ASC);

-- CreateIndex
CREATE INDEX "WorkforceQualityEvaluation_tenantId_idx" ON "public"."WorkforceQualityEvaluation"("tenantId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "WorkforceRequest_code_key" ON "public"."WorkforceRequest"("code" ASC);

-- CreateIndex
CREATE INDEX "WorkforceRequest_tenantId_idx" ON "public"."WorkforceRequest"("tenantId" ASC);

-- CreateIndex
CREATE INDEX "WorkforceRequestEvent_tenantId_idx" ON "public"."WorkforceRequestEvent"("tenantId" ASC);

-- CreateIndex
CREATE INDEX "WorkforceRequestItem_requestId_idx" ON "public"."WorkforceRequestItem"("requestId" ASC);

-- CreateIndex
CREATE INDEX "WorkforceRequestItem_tenantId_idx" ON "public"."WorkforceRequestItem"("tenantId" ASC);

-- CreateIndex
CREATE INDEX "WorkforceRequestItem_vendorId_idx" ON "public"."WorkforceRequestItem"("vendorId" ASC);

-- CreateIndex
CREATE INDEX "WorkforceRequestTemplate_tenantId_idx" ON "public"."WorkforceRequestTemplate"("tenantId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "WorkforceSettings_tenantId_key" ON "public"."WorkforceSettings"("tenantId" ASC);

-- CreateIndex
CREATE INDEX "WorkforceVendorCorrection_itemId_idx" ON "public"."WorkforceVendorCorrection"("itemId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "WorkforceVendorCorrection_reviewId_itemId_key" ON "public"."WorkforceVendorCorrection"("reviewId" ASC, "itemId" ASC);

-- CreateIndex
CREATE INDEX "WorkforceVendorCorrection_tenantId_idx" ON "public"."WorkforceVendorCorrection"("tenantId" ASC);

-- CreateIndex
CREATE INDEX "WorkforceVendorCorrectionReview_requestId_status_idx" ON "public"."WorkforceVendorCorrectionReview"("requestId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "WorkforceVendorCorrectionReview_tenantId_idx" ON "public"."WorkforceVendorCorrectionReview"("tenantId" ASC);

-- AddForeignKey
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Conversation" ADD CONSTRAINT "Conversation_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "public"."Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "public"."Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DepartmentCasualBudget" ADD CONSTRAINT "DepartmentCasualBudget_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "public"."Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Document" ADD CONSTRAINT "Document_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Document" ADD CONSTRAINT "Document_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "public"."Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Document" ADD CONSTRAINT "Document_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Document" ADD CONSTRAINT "Document_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "public"."Template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Document" ADD CONSTRAINT "Document_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "public"."WorkflowRoute"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "public"."Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentComment" ADD CONSTRAINT "DocumentComment_attachedDocumentId_fkey" FOREIGN KEY ("attachedDocumentId") REFERENCES "public"."Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentComment" ADD CONSTRAINT "DocumentComment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "public"."Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentComment" ADD CONSTRAINT "DocumentComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentHistory" ADD CONSTRAINT "DocumentHistory_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "public"."Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "public"."Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "public"."Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "public"."Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Signature" ADD CONSTRAINT "Signature_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "public"."Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Signature" ADD CONSTRAINT "Signature_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Template" ADD CONSTRAINT "Template_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "public"."Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_customRoleId_fkey" FOREIGN KEY ("customRoleId") REFERENCES "public"."CustomRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "public"."Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserFavorite" ADD CONSTRAINT "UserFavorite_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "public"."Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserFavorite" ADD CONSTRAINT "UserFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VendorApprovalEvent" ADD CONSTRAINT "VendorApprovalEvent_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "public"."Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VendorInvite" ADD CONSTRAINT "VendorInvite_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "public"."WorkforceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VendorInvite" ADD CONSTRAINT "VendorInvite_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "public"."Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VendorInvoice" ADD CONSTRAINT "VendorInvoice_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "public"."WorkforceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VendorInvoice" ADD CONSTRAINT "VendorInvoice_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "public"."Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VendorServiceRate" ADD CONSTRAINT "VendorServiceRate_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "public"."WorkforcePosition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VendorServiceRate" ADD CONSTRAINT "VendorServiceRate_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "public"."Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkforceApprovalRoute" ADD CONSTRAINT "WorkforceApprovalRoute_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "public"."Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkforcePosition" ADD CONSTRAINT "WorkforcePosition_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "public"."Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkforceQualityEvaluation" ADD CONSTRAINT "WorkforceQualityEvaluation_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "public"."WorkforceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkforceQualityEvaluation" ADD CONSTRAINT "WorkforceQualityEvaluation_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "public"."Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkforceRequest" ADD CONSTRAINT "WorkforceRequest_acceptedVendorId_fkey" FOREIGN KEY ("acceptedVendorId") REFERENCES "public"."Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkforceRequest" ADD CONSTRAINT "WorkforceRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkforceRequest" ADD CONSTRAINT "WorkforceRequest_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "public"."Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkforceRequest" ADD CONSTRAINT "WorkforceRequest_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "public"."WorkforcePosition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkforceRequest" ADD CONSTRAINT "WorkforceRequest_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "public"."Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkforceRequest" ADD CONSTRAINT "WorkforceRequest_vendorRateId_fkey" FOREIGN KEY ("vendorRateId") REFERENCES "public"."VendorServiceRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkforceRequestEvent" ADD CONSTRAINT "WorkforceRequestEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "public"."WorkforceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkforceRequestItem" ADD CONSTRAINT "WorkforceRequestItem_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "public"."WorkforcePosition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkforceRequestItem" ADD CONSTRAINT "WorkforceRequestItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "public"."WorkforceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkforceRequestItem" ADD CONSTRAINT "WorkforceRequestItem_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "public"."Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkforceRequestItem" ADD CONSTRAINT "WorkforceRequestItem_vendorRateId_fkey" FOREIGN KEY ("vendorRateId") REFERENCES "public"."VendorServiceRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkforceRequestTemplate" ADD CONSTRAINT "WorkforceRequestTemplate_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "public"."Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkforceRequestTemplate" ADD CONSTRAINT "WorkforceRequestTemplate_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "public"."WorkforcePosition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkforceVendorCorrection" ADD CONSTRAINT "WorkforceVendorCorrection_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "public"."WorkforceRequestItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkforceVendorCorrection" ADD CONSTRAINT "WorkforceVendorCorrection_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "public"."WorkforceVendorCorrectionReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkforceVendorCorrectionReview" ADD CONSTRAINT "WorkforceVendorCorrectionReview_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "public"."WorkforceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
