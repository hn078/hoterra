import { Role } from '@prisma/client';

export const PERMISSION_COLUMNS = [
  'Full Access',
  'Create',
  'Read',
  'Update',
  'Delete',
  'Export',
  'Manage',
];

const PERM = {
  full: [true, false, true, true, false, true, false],
  crud: [false, true, true, true, true, true, false],
  readExport: [false, false, true, false, false, true, false],
  readOnly: [false, false, true, false, false, false, false],
  none: [false, false, false, false, false, false, false],
};

export const ROLE_PERMISSIONS: Record<
  Role,
  { name: string; description: string; permissions: Record<string, boolean[]> }
> = {
  SYSTEM_ADMINISTRATOR: {
    name: 'System Administrator',
    description: 'Full system access and configuration',
    permissions: {
      Dashboard: PERM.full,
      Documents: [true, true, true, true, true, true, true],
      Templates: [true, true, true, true, true, true, true],
      Departments: [true, true, true, true, true, false, true],
      Workflows: [true, true, true, true, true, false, true],
      'Users & Roles': [true, true, true, true, true, true, true],
      'Casual Workforce': [true, true, true, true, true, true, true],
      Reports: PERM.full,
      Settings: [true, true, true, true, true, true, true],
    },
  },
  GENERAL_MANAGER: {
    name: 'General Manager',
    description: 'Executive oversight and final approvals',
    permissions: {
      Dashboard: PERM.full,
      Documents: PERM.crud,
      Templates: PERM.crud,
      Departments: PERM.readExport,
      Workflows: PERM.crud,
      'Users & Roles': PERM.readExport,
      'Casual Workforce': PERM.crud,
      Reports: PERM.full,
      Settings: PERM.readExport,
    },
  },
  FINANCE_DIRECTOR: {
    name: 'Finance Director',
    description: 'Financial document review and approval',
    permissions: {
      Dashboard: PERM.readExport,
      Documents: [false, false, true, true, false, true, false],
      Templates: PERM.readExport,
      Departments: PERM.readOnly,
      Workflows: PERM.readOnly,
      'Users & Roles': PERM.none,
      'Casual Workforce': [false, false, true, true, false, true, false],
      Reports: PERM.readExport,
      Settings: PERM.none,
    },
  },
  HOD: {
    name: 'Head of Department',
    description: 'Manage department documents and users',
    permissions: {
      Dashboard: PERM.readExport,
      Documents: PERM.crud,
      Templates: [false, true, true, true, false, false, false],
      Departments: [false, false, true, true, false, false, false],
      Workflows: PERM.readOnly,
      'Users & Roles': PERM.readOnly,
      'Casual Workforce': PERM.crud,
      Reports: PERM.readExport,
      Settings: PERM.none,
    },
  },
  SUPERVISOR: {
    name: 'Supervisor',
    description: 'Review team documents',
    permissions: {
      Dashboard: PERM.readOnly,
      Documents: [false, true, true, true, false, false, false],
      Templates: PERM.readOnly,
      Departments: PERM.readOnly,
      Workflows: PERM.readOnly,
      'Users & Roles': PERM.none,
      'Casual Workforce': [false, true, true, true, false, false, false],
      Reports: PERM.readOnly,
      Settings: PERM.none,
    },
  },
  EMPLOYEE: {
    name: 'Employee',
    description: 'Create and view assigned documents',
    permissions: {
      Dashboard: PERM.readOnly,
      Documents: [false, true, true, true, false, false, false],
      Templates: PERM.readOnly,
      Departments: PERM.readOnly,
      Workflows: PERM.readOnly,
      'Users & Roles': PERM.none,
      'Casual Workforce': PERM.readOnly,
      Reports: PERM.readOnly,
      Settings: PERM.none,
    },
  },
};
