import type {
  Document,
  DocumentCategory,
  DocumentStatus,
  Role,
  User,
  Department,
  Template,
} from '@/types';

export interface WorkflowItem {
  id: string;
  name: string;
  description?: string | null;
  steps: string[];
  isDefault: boolean;
  status: 'active' | 'draft';
  documentCount?: number;
}

export interface RoleDefinition {
  id: string;
  name: string;
  description: string;
  userCount: number;
  isSystem: boolean;
  permissions: Record<string, boolean[]>;
}

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    id: 'super-admin',
    name: 'Super Admin',
    description: 'Full system access',
    userCount: 1,
    isSystem: true,
    permissions: {
      Dashboard: [true, false, true, true, false, true, false],
      Documents: [true, true, true, true, true, true, true],
      Templates: [true, true, true, true, true, true, true],
      Departments: [true, true, true, true, true, false, true],
      Workflows: [true, true, true, true, true, false, true],
      'Users & Roles': [true, true, true, true, true, true, true],
      Reports: [true, false, true, false, true, true, false],
      Settings: [true, true, true, true, true, true, true],
    },
  },
  {
    id: 'manager',
    name: 'Manager',
    description: 'Manage users, documents, and settings',
    userCount: 15,
    isSystem: true,
    permissions: {
      Dashboard: [false, false, true, false, true, false, false],
      Documents: [false, true, true, true, true, true, false],
      Templates: [false, true, true, true, false, true, false],
      Departments: [false, false, true, false, false, false, false],
      Workflows: [false, true, true, true, false, false, false],
      'Users & Roles': [false, false, true, false, false, false, false],
      Reports: [false, false, true, false, true, false, false],
      Settings: [false, false, true, false, false, false, false],
    },
  },
  {
    id: 'approver',
    name: 'Document Approver',
    description: 'Review and approve documents',
    userCount: 23,
    isSystem: true,
    permissions: {
      Dashboard: [false, false, true, false, false, false, false],
      Documents: [false, false, true, true, false, false, false],
      Templates: [false, false, true, false, false, false, false],
      Departments: [false, false, true, false, false, false, false],
      Workflows: [false, false, true, false, false, false, false],
      'Users & Roles': [false, false, false, false, false, false, false],
      Reports: [false, false, true, false, false, false, false],
      Settings: [false, false, false, false, false, false, false],
    },
  },
  {
    id: 'hod',
    name: 'Department Head',
    description: 'Manage department documents and users',
    userCount: 18,
    isSystem: true,
    permissions: {
      Dashboard: [false, false, true, false, false, false, false],
      Documents: [false, true, true, true, true, true, false],
      Templates: [false, true, true, true, false, false, false],
      Departments: [false, false, true, true, false, false, false],
      Workflows: [false, false, true, false, false, false, false],
      'Users & Roles': [false, false, true, false, false, false, false],
      Reports: [false, false, true, false, true, false, false],
      Settings: [false, false, false, false, false, false, false],
    },
  },
  {
    id: 'editor',
    name: 'Editor',
    description: 'Create and edit documents',
    userCount: 42,
    isSystem: true,
    permissions: {
      Dashboard: [false, false, true, false, false, false, false],
      Documents: [false, true, true, true, false, false, false],
      Templates: [false, false, true, false, false, false, false],
      Departments: [false, false, true, false, false, false, false],
      Workflows: [false, false, true, false, false, false, false],
      'Users & Roles': [false, false, false, false, false, false, false],
      Reports: [false, false, false, false, false, false, false],
      Settings: [false, false, false, false, false, false, false],
    },
  },
  {
    id: 'viewer',
    name: 'Viewer',
    description: 'View documents only',
    userCount: 48,
    isSystem: true,
    permissions: {
      Dashboard: [false, false, true, false, false, false, false],
      Documents: [false, false, true, false, false, false, false],
      Templates: [false, false, true, false, false, false, false],
      Departments: [false, false, true, false, false, false, false],
      Workflows: [false, false, true, false, false, false, false],
      'Users & Roles': [false, false, false, false, false, false, false],
      Reports: [false, false, true, false, false, false, false],
      Settings: [false, false, false, false, false, false, false],
    },
  },
];

export const PERMISSION_COLUMNS = [
  'Full Access',
  'Create',
  'Read',
  'Update',
  'Delete',
  'Export',
  'Manage',
];

export const DEPARTMENT_META: Record<string, { location: string; description: string; headEmail: string }> = {
  FO: { location: 'Main Hotel', description: 'Guest services, reservations and front desk operations.', headEmail: 'nigar.rustamova@hoterra.az' },
  HK: { location: 'Main Hotel', description: 'Room cleaning, laundry and guest room standards.', headEmail: 'employee@hoterra.az' },
  FI: { location: 'Head Office', description: 'Financial planning, accounting and budget control.', headEmail: 'elnur.mahmudov@hoterra.az' },
  HR: { location: 'Head Office', description: 'Recruitment, training and employee relations.', headEmail: 'employee@hoterra.az' },
  FB: { location: 'Main Hotel', description: 'Restaurant, bar and banquet operations.', headEmail: 'employee@hoterra.az' },
  KT: { location: 'Main Hotel', description: 'Kitchen operations and food preparation standards.', headEmail: 'employee@hoterra.az' },
  GM: { location: 'Head Office', description: 'Executive management and corporate governance.', headEmail: 'fuad.ahmadov@hoterra.az' },
};

export function getPriority(index: number): 'high' | 'medium' | 'low' {
  return index % 3 === 0 ? 'high' : index % 3 === 1 ? 'medium' : 'low';
}

export function enrichDepartment(dept: Department, users: User[]) {
  const meta = DEPARTMENT_META[dept.code] || { location: 'Main Hotel', description: dept.name, headEmail: '' };
  const head = users.find((u) => u.department?.id === dept.id && (u.role === 'HOD' || u.role === 'GENERAL_MANAGER'));
  return {
    ...dept,
    location: meta.location,
    description: meta.description,
    head,
    activeSops: Math.max(1, Math.floor((dept._count?.documents || 0) * 0.3)),
    totalSops: Math.max(1, Math.floor((dept._count?.documents || 0) * 0.4)),
    underReview: Math.max(0, Math.floor((dept._count?.documents || 0) * 0.05)),
  };
}

export function enrichTemplate(t: Template, index: number) {
  const types = ['Document', 'Spreadsheet', 'Presentation'] as const;
  const statuses = ['Active', 'Under Review', 'Draft'] as const;
  return {
    ...t,
    type: types[index % 3],
    version: `${1 + (index % 3)}.${index % 5}`,
    status: t.isActive !== false ? statuses[index % 3] : 'Draft',
    department: ['Human Resources', 'Finance', 'Front Office', 'Kitchen'][index % 4],
    updatedBy: ['Aysel Yusifova', 'Elnur Mahmudov', 'Nigar Rustamova', 'Fuad Ahmadov'][index % 4],
  };
}

export interface ArchiveItem {
  id: string;
  name: string;
  code: string;
  type: string;
  module: string;
  archivedBy: string;
  archivedAt: string;
  reason: string;
  size?: string;
}

export function buildArchiveItems(docs: Document[]): ArchiveItem[] {
  return docs
    .filter((d) => d.status === 'ARCHIVED')
    .map((d) => ({
      id: d.id,
      name: d.title,
      code: d.code,
      type: 'Document',
      module: 'Documents',
      archivedBy: `${d.author.firstName} ${d.author.lastName}`,
      archivedAt: d.updatedAt,
      reason: 'Document outdated',
      size: '2.4 MB',
    }));
}

export const REPORTS_CHART_DATA = {
  documentsOverview: [
    { date: 'May 1', created: 120, uploaded: 80, deleted: 12 },
    { date: 'May 3', created: 145, uploaded: 95, deleted: 8 },
    { date: 'May 5', created: 132, uploaded: 110, deleted: 15 },
    { date: 'May 7', created: 168, uploaded: 88, deleted: 10 },
    { date: 'May 10', created: 190, uploaded: 120, deleted: 18 },
  ],
  byDepartment: [
    { name: 'Finance', value: 22.7, color: '#3B82F6' },
    { name: 'Human Resources', value: 18.4, color: '#8B5CF6' },
    { name: 'Operations', value: 17.1, color: '#10B981' },
    { name: 'IT Department', value: 15.5, color: '#06B6D4' },
    { name: 'Marketing', value: 10.5, color: '#F97316' },
    { name: 'Other', value: 15.8, color: '#6B7280' },
  ],
  approvalPerformance: [
    { name: 'Approved', value: 82.4, color: '#10B981' },
    { name: 'Rejected', value: 11.3, color: '#EF4444' },
    { name: 'Pending', value: 6.3, color: '#F59E0B' },
  ],
};

export const WORKFLOW_STEPS = [
  { id: 'start', type: 'start', title: 'Start', subtitle: 'Workflow initiated', color: 'bg-green-500' },
  { id: 'author', type: 'task', title: 'User Task', subtitle: 'Author — Create and submit document', color: 'bg-blue-500' },
  { id: 'supervisor', type: 'approval', title: 'Approval Task', subtitle: 'Supervisor Approval — Review and approve', color: 'bg-purple-500' },
  { id: 'condition', type: 'condition', title: 'Condition', subtitle: 'Document Type — Policy / SOP?', color: 'bg-yellow-400' },
  { id: 'hod', type: 'approval', title: 'Approval Task', subtitle: 'HOD Approval — Department head review', color: 'bg-purple-500' },
  { id: 'parallel', type: 'parallel', title: 'Parallel Approval', subtitle: 'Finance & Legal Review — All must approve', color: 'bg-orange-500' },
  { id: 'gm', type: 'task', title: 'User Task', subtitle: 'General Manager Approval — Final approval', color: 'bg-blue-500' },
  { id: 'end', type: 'end', title: 'End', subtitle: 'Publish Document — Document is published', color: 'bg-red-500' },
];

export const TEMPLATE_FIELDS = [
  { group: 'Document Information', fields: ['Document Code', 'Document Title', 'Version', 'Effective Date', 'Review Date'] },
  { group: 'Organization', fields: ['Company Name', 'Department', 'Location', 'Cost Center'] },
  { group: 'People', fields: ['Author', 'Reviewer', 'Approver', 'Prepared By'] },
  { group: 'Dates', fields: ['Created Date', 'Updated Date', 'Approval Date'] },
];

export function mapAuditAction(action: string): { label: string; color: string; module: string; severity: string } {
  const map: Record<string, { label: string; color: string; module: string; severity: string }> = {
    LOGIN: { label: 'Login Authentication', color: 'bg-blue-100 text-blue-700', module: 'System', severity: 'Low' },
    LOGOUT: { label: 'Logout', color: 'bg-gray-100 text-gray-700', module: 'System', severity: 'Low' },
    CREATE: { label: 'Created Document', color: 'bg-green-100 text-green-700', module: 'Documents', severity: 'Medium' },
    UPDATE: { label: 'Updated Document', color: 'bg-blue-100 text-blue-700', module: 'Documents', severity: 'Medium' },
    DELETE: { label: 'Deleted Document', color: 'bg-red-100 text-red-700', module: 'Documents', severity: 'High' },
    PUBLISH: { label: 'Published Document', color: 'bg-green-100 text-green-700', module: 'Documents', severity: 'Medium' },
    APPROVE: { label: 'Approved Document', color: 'bg-green-100 text-green-700', module: 'My Approvals', severity: 'Medium' },
    REJECT: { label: 'Rejected Document', color: 'bg-red-100 text-red-700', module: 'My Approvals', severity: 'High' },
    SIGN: { label: 'Signed Document', color: 'bg-purple-100 text-purple-700', module: 'Documents', severity: 'Medium' },
    ARCHIVE: { label: 'Archived Document', color: 'bg-slate-100 text-slate-700', module: 'Archive', severity: 'Low' },
  };
  return map[action] || { label: action, color: 'bg-gray-100 text-gray-700', module: 'System', severity: 'Low' };
}
