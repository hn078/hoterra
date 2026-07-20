export type Role =
  | 'EMPLOYEE'
  | 'SUPERVISOR'
  | 'HOD'
  | 'FINANCE_DIRECTOR'
  | 'GENERAL_MANAGER'
  | 'SYSTEM_ADMINISTRATOR';

export type DocumentStatus =
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'SIGNED_HOD'
  | 'SIGNED_FINANCE'
  | 'SIGNED_GM'
  | 'PUBLISHED'
  | 'REJECTED'
  | 'ARCHIVED'
  | 'NEEDS_REVIEW';

export type DocumentCategory =
  | 'POLICIES'
  | 'SOP'
  | 'FORMS'
  | 'CHECKLISTS'
  | 'TEMPLATES'
  | 'REPORTS'
  | 'CONTRACTS'
  | 'TRAINING_MATERIALS'
  | 'ARCHIVE';

export type DocumentPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export interface Department {
  id: string;
  name: string;
  code: string;
  color: string;
  location?: string;
  description?: string | null;
  _count?: { documents: number; users: number };
  head?: { id: string; firstName: string; lastName: string; email: string; role: Role } | null;
  sopStats?: { active: number; total: number };
  stats?: { workflows: number; templates: number; underReview: number };
}

export interface DocumentComment {
  id: string;
  documentId: string;
  text: string;
  status: string;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string };
  attachedDocument?: ChatMessageDocument | null;
  fileAttachment?: ChatMessageFileAttachment | null;
}

export interface DocumentAttachment {
  id: string;
  documentId: string;
  fileName: string;
  filePath: string;
  fileSize?: number | null;
  fileType?: string | null;
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  isActive?: boolean;
  signatureImage?: string | null;
  department?: Department | null;
}

export type SignaturePageTarget = number | 'all';

export interface SignaturePlacement {
  id: string;
  role: Role;
  label: string;
  page: SignaturePageTarget;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Document {
  id: string;
  title: string;
  code: string;
  version: string;
  description?: string | null;
  status: DocumentStatus;
  category: DocumentCategory;
  language: string;
  tags: string[];
  departmentId: string;
  department: Department;
  authorId: string;
  author: { id: string; firstName: string; lastName: string };
  owner?: { id: string; firstName: string; lastName: string } | null;
  nextReviewDate?: string | null;
  effectiveDate?: string | null;
  isLocked: boolean;
  pageCount?: number;
  signaturePlacement?: string | SignaturePlacement[];
  priority?: DocumentPriority;
  content?: string | null;
  filePath?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  fileSize?: number | null;
  archiveReason?: string | null;
  archivedAt?: string | null;
  archivedBy?: string | null;
  workflowId?: string | null;
  allowDownload?: boolean;
  allowComments?: boolean;
  createdAt: string;
  updatedAt: string;
  history?: DocumentHistory[];
  signatures?: Signature[];
  comments?: DocumentComment[];
  attachments?: DocumentAttachment[];
  versions?: { id: string; version: string; changeNote?: string | null; createdAt: string }[];
  workflow?: WorkflowItem | null;
}

export interface DocumentHistory {
  id: string;
  action: string;
  userId?: string | null;
  userName?: string | null;
  createdAt: string;
}

export interface Signature {
  id: string;
  fullName: string;
  position: string;
  signedAt: string;
  imagePath?: string | null;
  placementId?: string | null;
  page?: number | null;
  user?: { firstName: string; lastName: string; role: Role };
}

export interface Template {
  id: string;
  name: string;
  description?: string | null;
  category: DocumentCategory;
  content?: string | null;
  version?: string;
  status?: string;
  departmentId?: string | null;
  department?: Department | null;
  isActive?: boolean;
  pageCount?: number;
  signaturePlacement?: string | SignaturePlacement[];
  createdAt?: string;
  updatedAt?: string;
  _count?: { documents: number };
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  link?: string | null;
  createdAt: string;
}

export type ConversationType = 'DIRECT' | 'DEPARTMENT' | 'HOTEL';

export interface Conversation {
  id: string;
  type: ConversationType;
  name: string;
  departmentId?: string | null;
  department?: Pick<Department, 'id' | 'name' | 'color' | 'code'> | null;
  otherUser?: Pick<User, 'id' | 'firstName' | 'lastName'>;
  lastMessage?: {
    content: string;
    createdAt: string;
    senderName: string;
  } | null;
  unreadCount: number;
  updatedAt: string;
}

export interface ChatMessageDocument {
  id: string;
  title: string;
  code: string;
  status: DocumentStatus;
}

export interface ChatMessageFileAttachment {
  fileName: string;
  fileSize: number;
  fileType?: string | null;
  downloadUrl: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  sender: Pick<User, 'id' | 'firstName' | 'lastName'>;
  content: string;
  document?: ChatMessageDocument | null;
  fileAttachment?: ChatMessageFileAttachment | null;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId?: string | null;
  userName?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  details?: string | null;
  ipAddress?: string | null;
  createdAt: string;
}

export interface WorkflowItem {
  id: string;
  name: string;
  description?: string | null;
  steps: import('@/lib/workflows').WorkflowStep[];
  stepCount?: number;
  stepsSummary?: string;
  isDefault: boolean;
  status: import('@/lib/workflows').WorkflowStatus;
  createdAt?: string;
}

export interface DashboardStats {
  cards: {
    pendingApproval: number;
    overdue: number;
    dueForReview: number;
    published: number;
    archived: number;
  };
  byStatus: { status: DocumentStatus; count: number }[];
  byDepartment: {
    department: string;
    departmentId: string;
    count: number;
    color?: string;
  }[];
  recentActivity: {
    id: string;
    action: string;
    userName?: string | null;
    createdAt: string;
    document?: { title: string; code: string };
  }[];
  upcomingReviews?: {
    id: string;
    title: string;
    department: string;
    category: DocumentCategory;
    nextReviewDate: string | null;
  }[];
  trend?: { month: string; created: number; published: number }[];
}

export interface SystemSettings {
  companyName: string;
  companyAddress: string;
  timezone: string;
  dateFormat: string;
  timeFormat: string;
  systemLanguage: string;
  enableVersioning: boolean;
  mandatoryReviewDate: boolean;
  requireDescription: boolean;
  allowDownload: boolean;
  autoLogoutMinutes: number;
  recordsPerPage: number;
  enable2FA: boolean;
  allowComments: boolean;
  showTooltips: boolean;
  defaultStartPage: string;
  defaultDocSort: string;
  defaultDocStatus: string;
  notifyEmail?: boolean;
  notifyPush?: boolean;
  notifyInApp?: boolean;
  extended?: Record<string, unknown>;
}

export const STATUS_LABELS: Record<DocumentStatus, string> = {
  DRAFT: 'Draft',
  IN_REVIEW: 'In Review',
  SIGNED_HOD: 'Signed by HOD',
  SIGNED_FINANCE: 'Signed by Finance',
  SIGNED_GM: 'Signed by GM',
  PUBLISHED: 'Published',
  REJECTED: 'Rejected',
  ARCHIVED: 'Archived',
  NEEDS_REVIEW: 'Needs Review',
};

export const STATUS_COLORS: Record<DocumentStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-700 border-gray-300',
  IN_REVIEW: 'bg-orange-100 text-orange-700 border-orange-300',
  SIGNED_HOD: 'bg-purple-100 text-purple-700 border-purple-300',
  SIGNED_FINANCE: 'bg-blue-100 text-blue-700 border-blue-300',
  SIGNED_GM: 'bg-cyan-100 text-cyan-700 border-cyan-300',
  PUBLISHED: 'bg-green-100 text-green-700 border-green-300',
  REJECTED: 'bg-red-100 text-red-700 border-red-300',
  ARCHIVED: 'bg-slate-100 text-slate-600 border-slate-300',
  NEEDS_REVIEW: 'bg-amber-100 text-amber-700 border-amber-300',
};

export const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  POLICIES: 'Policies',
  SOP: 'SOP',
  FORMS: 'Forms',
  CHECKLISTS: 'Checklists',
  TEMPLATES: 'Templates',
  REPORTS: 'Reports',
  CONTRACTS: 'Contracts',
  TRAINING_MATERIALS: 'Training Materials',
  ARCHIVE: 'Archive',
};

export const ROLE_LABELS: Record<Role, string> = {
  EMPLOYEE: 'Employee',
  SUPERVISOR: 'Supervisor',
  HOD: 'Head of Department',
  FINANCE_DIRECTOR: 'Finance Director',
  GENERAL_MANAGER: 'General Manager',
  SYSTEM_ADMINISTRATOR: 'System Administrator',
};

export type WorkforceRequestStatus =
  | 'PENDING'
  | 'AWAITING_EXTRA_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'SENT_TO_VENDOR'
  | 'VENDOR_ACCEPTED'
  | 'VENDOR_DECLINED'
  | 'COMPLETED'
  | 'CANCELLED';

export type WorkforceShift = 'MORNING' | 'EVENING' | 'NIGHT' | 'CUSTOM';
export type WorkforceVendorMode = 'DIRECT' | 'BROADCAST';

export interface WorkforceApprovalStep {
  role: Role;
  label: string;
}

export interface WorkforcePosition {
  id: string;
  name: string;
  isActive: boolean;
}

export interface Vendor {
  id: string;
  name: string;
  contactEmail?: string | null;
  phone?: string | null;
  isApproved: boolean;
  isActive: boolean;
}

export interface WorkforceRequestEvent {
  id: string;
  action: string;
  details?: string | null;
  userId?: string | null;
  userName?: string | null;
  createdAt: string;
}

export interface WorkforceRequest {
  id: string;
  code: string;
  hotelName: string;
  departmentId: string;
  department: Department;
  positionId: string;
  position: WorkforcePosition;
  workDate: string;
  shift: WorkforceShift;
  startTime?: string | null;
  endTime?: string | null;
  quantity: number;
  comment?: string | null;
  vendorMode: WorkforceVendorMode;
  vendorId?: string | null;
  vendor?: Vendor | null;
  acceptedVendorId?: string | null;
  acceptedVendor?: Vendor | null;
  broadcastVendorIds: string[];
  status: WorkforceRequestStatus;
  currentStepIndex: number;
  approvalSteps: WorkforceApprovalStep[];
  needsExtraApproval: boolean;
  isUrgentOverride: boolean;
  estimatedCost?: number | null;
  createdBy: { id: string; firstName: string; lastName: string; email: string; role: Role };
  actualQuantity?: number | null;
  actualHours?: number | null;
  actualCost?: number | null;
  hodConfirmedAt?: string | null;
  financeConfirmedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  events: WorkforceRequestEvent[];
  invites?: VendorInvite[];
  invoices?: VendorInvoice[];
  canApprove?: boolean;
  canManage?: boolean;
}

export interface VendorInvite {
  id: string;
  token: string;
  vendorId: string;
  vendor: Vendor;
  status: string;
  sentAt: string;
  respondedAt?: string | null;
  expiresAt: string;
  portalPath: string;
}

export interface VendorInvoice {
  id: string;
  vendorId: string;
  vendor: Vendor;
  invoiceNumber: string;
  invoiceHours: number;
  invoiceAmount: number;
  invoiceDate: string;
  status: string;
  matchedAt?: string | null;
  notes?: string | null;
  createdAt: string;
  request?: WorkforceRequest;
}

export interface WorkforceMeta {
  positions: WorkforcePosition[];
  vendors: Vendor[];
  settings: {
    id: string;
    hotelName: string;
    hotels: string[];
    minLeadHours: number;
    estimatedHourlyRate: number;
    estimatedHoursPerShift: number;
    notifyEmail: boolean;
    notifyPush: boolean;
    payrollTolerancePct: number;
  };
  routes: {
    id: string;
    departmentId: string;
    name: string;
    steps: WorkforceApprovalStep[];
    department: Department;
  }[];
  budgets: {
    id: string;
    departmentId: string;
    year: number;
    month: number;
    budgetAmount: number;
    department: Department;
  }[];
  templates: {
    id: string;
    name: string;
    departmentId?: string | null;
    positionId?: string | null;
    shift: WorkforceShift;
    quantity: number;
    comment?: string | null;
    dayOfWeek?: number | null;
    vendorMode: WorkforceVendorMode;
    vendorId?: string | null;
    isRecurring?: boolean;
    hotelName?: string | null;
    lastGeneratedAt?: string | null;
    department?: Department | null;
    position?: WorkforcePosition | null;
  }[];
  defaultPositions: string[];
  approvalRoles?: Role[];
}

export interface WorkforceReport {
  year: number;
  month: number;
  summary: {
    totalRequests: number;
    activeRequests: number;
    completedRequests: number;
    totalCost: number;
    totalHours: number;
    totalHeadcount: number;
  };
  byDepartment: { name: string; requests: number; cost: number; hours: number }[];
  byVendor: { name: string; requests: number; cost: number }[];
  byPosition: { name: string; requests: number; quantity: number; cost: number }[];
  byHotel: { name: string; requests: number; cost: number; hours: number }[];
  budgetVsActual: {
    departmentId: string;
    department: string;
    budget: number;
    actual: number;
    variance: number;
  }[];
}

export const WORKFORCE_STATUS_LABELS: Record<WorkforceRequestStatus, string> = {
  PENDING: 'Pending',
  AWAITING_EXTRA_APPROVAL: 'Extra Approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  SENT_TO_VENDOR: 'Sent to Vendor',
  VENDOR_ACCEPTED: 'Vendor Accepted',
  VENDOR_DECLINED: 'Vendor Declined',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const WORKFORCE_STATUS_COLORS: Record<WorkforceRequestStatus, string> = {
  PENDING: 'bg-orange-100 text-orange-700 border-orange-300',
  AWAITING_EXTRA_APPROVAL: 'bg-amber-100 text-amber-800 border-amber-300',
  APPROVED: 'bg-blue-100 text-blue-700 border-blue-300',
  REJECTED: 'bg-red-100 text-red-700 border-red-300',
  SENT_TO_VENDOR: 'bg-indigo-100 text-indigo-700 border-indigo-300',
  VENDOR_ACCEPTED: 'bg-cyan-100 text-cyan-700 border-cyan-300',
  VENDOR_DECLINED: 'bg-rose-100 text-rose-700 border-rose-300',
  COMPLETED: 'bg-green-100 text-green-700 border-green-300',
  CANCELLED: 'bg-slate-100 text-slate-600 border-slate-300',
};

export const WORKFORCE_SHIFT_LABELS: Record<WorkforceShift, string> = {
  MORNING: 'Morning',
  EVENING: 'Evening',
  NIGHT: 'Night',
  CUSTOM: 'Custom',
};
