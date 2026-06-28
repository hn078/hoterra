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

export interface Department {
  id: string;
  name: string;
  code: string;
  color: string;
  _count?: { documents: number; users: number };
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  department?: Department | null;
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
  createdAt: string;
  updatedAt: string;
  history?: DocumentHistory[];
  signatures?: Signature[];
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
  user?: { firstName: string; lastName: string; role: Role };
}

export interface Template {
  id: string;
  name: string;
  description?: string | null;
  category: DocumentCategory;
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
