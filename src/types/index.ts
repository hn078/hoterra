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
  steps: string[];
  isDefault: boolean;
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
