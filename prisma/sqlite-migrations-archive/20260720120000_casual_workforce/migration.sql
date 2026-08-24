-- CreateTable
CREATE TABLE "WorkforcePosition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "WorkforcePosition_name_key" ON "WorkforcePosition"("name");

CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "contactEmail" TEXT,
    "phone" TEXT,
    "isApproved" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "Vendor_name_key" ON "Vendor"("name");

CREATE TABLE "WorkforceApprovalRoute" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "steps" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkforceApprovalRoute_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "WorkforceApprovalRoute_departmentId_key" ON "WorkforceApprovalRoute"("departmentId");

CREATE TABLE "DepartmentCasualBudget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "departmentId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "budgetAmount" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DepartmentCasualBudget_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DepartmentCasualBudget_departmentId_year_month_key" ON "DepartmentCasualBudget"("departmentId", "year", "month");

CREATE TABLE "WorkforceSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hotelName" TEXT NOT NULL DEFAULT 'HOTERRA',
    "minLeadHours" INTEGER NOT NULL DEFAULT 24,
    "estimatedHourlyRate" REAL NOT NULL DEFAULT 15,
    "estimatedHoursPerShift" REAL NOT NULL DEFAULT 8
);

CREATE TABLE "WorkforceRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "hotelName" TEXT NOT NULL DEFAULT 'HOTERRA',
    "departmentId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "workDate" DATETIME NOT NULL,
    "shift" TEXT NOT NULL DEFAULT 'MORNING',
    "startTime" TEXT,
    "endTime" TEXT,
    "quantity" INTEGER NOT NULL,
    "comment" TEXT,
    "vendorMode" TEXT NOT NULL DEFAULT 'DIRECT',
    "vendorId" TEXT,
    "acceptedVendorId" TEXT,
    "broadcastVendorIds" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "currentStepIndex" INTEGER NOT NULL DEFAULT 0,
    "approvalSteps" TEXT NOT NULL DEFAULT '[]',
    "needsExtraApproval" BOOLEAN NOT NULL DEFAULT false,
    "isUrgentOverride" BOOLEAN NOT NULL DEFAULT false,
    "estimatedCost" REAL,
    "createdById" TEXT NOT NULL,
    "actualQuantity" INTEGER,
    "actualHours" REAL,
    "actualCost" REAL,
    "hodConfirmedAt" DATETIME,
    "hodConfirmedById" TEXT,
    "financeConfirmedAt" DATETIME,
    "financeConfirmedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkforceRequest_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkforceRequest_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "WorkforcePosition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkforceRequest_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkforceRequest_acceptedVendorId_fkey" FOREIGN KEY ("acceptedVendorId") REFERENCES "Vendor" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkforceRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "WorkforceRequest_code_key" ON "WorkforceRequest"("code");

CREATE TABLE "WorkforceRequestEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "userId" TEXT,
    "userName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkforceRequestEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "WorkforceRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "WorkforceRequestTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "departmentId" TEXT,
    "positionId" TEXT,
    "shift" TEXT NOT NULL DEFAULT 'MORNING',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "comment" TEXT,
    "dayOfWeek" INTEGER,
    "vendorMode" TEXT NOT NULL DEFAULT 'DIRECT',
    "vendorId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkforceRequestTemplate_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkforceRequestTemplate_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "WorkforcePosition" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
