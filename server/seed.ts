import bcrypt from 'bcryptjs';
import {
  PrismaClient,
  Role,
  DocumentStatus,
  DocumentCategory,
  AuditAction,
} from '@prisma/client';

const prisma = new PrismaClient();

const DEPARTMENTS = [
  { name: 'General Management', code: 'GM', color: '#6B7280' },
  { name: 'Front Office', code: 'FO', color: '#3B82F6' },
  { name: 'Housekeeping', code: 'HK', color: '#10B981' },
  { name: 'Finance', code: 'FI', color: '#8B5CF6' },
  { name: 'Human Resources', code: 'HR', color: '#F97316' },
  { name: 'Sales & Marketing', code: 'SM', color: '#06B6D4' },
  { name: 'Engineering', code: 'EN', color: '#14B8A6' },
  { name: 'Security', code: 'SC', color: '#1E3A5F' },
  { name: 'Procurement', code: 'PR', color: '#EAB308' },
  { name: 'Food & Beverage', code: 'FB', color: '#EF4444' },
  { name: 'Kitchen', code: 'KT', color: '#EC4899' },
];

const TEMPLATES = [
  { name: 'SOP Standard Template', category: DocumentCategory.SOP, description: 'Standard operating procedure format' },
  { name: 'Policy Template', category: DocumentCategory.POLICIES, description: 'Corporate policy document' },
  { name: 'Form Template', category: DocumentCategory.FORMS, description: 'Fillable form template' },
  { name: 'Checklist Template', category: DocumentCategory.CHECKLISTS, description: 'Operational checklist' },
  { name: 'Contract Template', category: DocumentCategory.CONTRACTS, description: 'Vendor and service contracts' },
];

async function main() {
  console.log('Seeding HOTERRA HDMS database...');

  for (const dept of DEPARTMENTS) {
    await prisma.department.upsert({
      where: { code: dept.code },
      update: {},
      create: dept,
    });
  }

  const departments = await prisma.department.findMany();
  const deptByCode = Object.fromEntries(departments.map((d) => [d.code, d]));

  const passwordHash = await bcrypt.hash('password123', 10);
  const pinHash = await bcrypt.hash('1234', 10);

  const users = [
    {
      email: 'fuad.ahmadov@hoterra.az',
      firstName: 'Fuad',
      lastName: 'Ahmadov',
      role: Role.GENERAL_MANAGER,
      departmentId: deptByCode.GM.id,
    },
    {
      email: 'nigar.rustamova@hoterra.az',
      firstName: 'Nigar',
      lastName: 'Rustamova',
      role: Role.HOD,
      departmentId: deptByCode.FO.id,
    },
    {
      email: 'elnur.mahmudov@hoterra.az',
      firstName: 'Elnur',
      lastName: 'Mahmudov',
      role: Role.FINANCE_DIRECTOR,
      departmentId: deptByCode.FI.id,
    },
    {
      email: 'employee@hoterra.az',
      firstName: 'Leyla',
      lastName: 'Huseynova',
      role: Role.EMPLOYEE,
      departmentId: deptByCode.FO.id,
    },
    {
      email: 'admin@hoterra.az',
      firstName: 'System',
      lastName: 'Administrator',
      role: Role.SYSTEM_ADMINISTRATOR,
      departmentId: deptByCode.GM.id,
    },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { ...u, passwordHash, pinHash },
    });
  }

  const allUsers = await prisma.user.findMany();
  const userByEmail = Object.fromEntries(allUsers.map((u) => [u.email, u]));

  for (const t of TEMPLATES) {
    const existing = await prisma.template.findFirst({ where: { name: t.name } });
    if (!existing) {
      await prisma.template.create({ data: t });
    }
  }

  await prisma.systemSettings.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default' },
  });

  await prisma.workflowRoute.upsert({
    where: { id: 'standard' },
    update: {},
    create: {
      id: 'standard',
      name: 'Standard Route',
      description: 'Author → HOD → Finance → GM',
      steps: JSON.stringify(['HOD', 'FINANCE', 'GM']),
      isDefault: true,
    },
  });

  const sampleDocs = [
    {
      title: 'Credit Card Handling Procedure',
      code: 'FO-SOP-001',
      category: DocumentCategory.SOP,
      departmentId: deptByCode.FO.id,
      authorId: userByEmail['fuad.ahmadov@hoterra.az'].id,
      ownerId: userByEmail['nigar.rustamova@hoterra.az'].id,
      status: DocumentStatus.PUBLISHED,
      version: '2.1',
      description: 'Procedure for secure handling of guest credit card information at front desk.',
      tags: JSON.stringify(['Credit Card', 'Payment']),
      nextReviewDate: new Date('2026-06-12'),
      effectiveDate: new Date('2025-06-12'),
      isLocked: true,
    },
    {
      title: 'Housekeeping Cleaning Checklist',
      code: 'HK-CHK-012',
      category: DocumentCategory.CHECKLISTS,
      departmentId: deptByCode.HK.id,
      authorId: userByEmail['employee@hoterra.az'].id,
      ownerId: userByEmail['employee@hoterra.az'].id,
      status: DocumentStatus.IN_REVIEW,
      version: '1.3',
      tags: JSON.stringify(['Cleaning', 'Daily']),
      nextReviewDate: new Date('2025-06-15'),
    },
    {
      title: 'Monthly Budget Planning Template',
      code: 'FI-TPL-005',
      category: DocumentCategory.TEMPLATES,
      departmentId: deptByCode.FI.id,
      authorId: userByEmail['elnur.mahmudov@hoterra.az'].id,
      ownerId: userByEmail['elnur.mahmudov@hoterra.az'].id,
      status: DocumentStatus.SIGNED_HOD,
      version: '3.0',
      tags: JSON.stringify(['Budget', 'Finance']),
    },
    {
      title: 'Guest Privacy Policy',
      code: 'GM-POL-003',
      category: DocumentCategory.POLICIES,
      departmentId: deptByCode.GM.id,
      authorId: userByEmail['fuad.ahmadov@hoterra.az'].id,
      ownerId: userByEmail['fuad.ahmadov@hoterra.az'].id,
      status: DocumentStatus.DRAFT,
      version: '1.0',
      tags: JSON.stringify(['Privacy', 'GDPR']),
    },
    {
      title: 'Vendor Agreement Template',
      code: 'PR-CON-008',
      category: DocumentCategory.CONTRACTS,
      departmentId: deptByCode.PR.id,
      authorId: userByEmail['elnur.mahmudov@hoterra.az'].id,
      ownerId: userByEmail['elnur.mahmudov@hoterra.az'].id,
      status: DocumentStatus.SIGNED_FINANCE,
      version: '1.0',
      tags: JSON.stringify(['Vendor', 'Contract']),
    },
  ];

  for (const doc of sampleDocs) {
    await prisma.document.upsert({
      where: { code: doc.code },
      update: {},
      create: doc,
    });
  }

  const publishedDoc = await prisma.document.findUnique({
    where: { code: 'FO-SOP-001' },
  });

  if (publishedDoc) {
    const sigUsers = [
      { user: userByEmail['nigar.rustamova@hoterra.az'], position: 'Head of Department' },
      { user: userByEmail['elnur.mahmudov@hoterra.az'], position: 'Finance Director' },
      { user: userByEmail['fuad.ahmadov@hoterra.az'], position: 'General Manager' },
    ];

    for (const s of sigUsers) {
      const exists = await prisma.signature.findFirst({
        where: { documentId: publishedDoc.id, userId: s.user.id },
      });
      if (!exists) {
        await prisma.signature.create({
          data: {
            documentId: publishedDoc.id,
            userId: s.user.id,
            fullName: `${s.user.firstName} ${s.user.lastName}`,
            position: s.position,
            ipAddress: '192.168.1.100',
            device: 'Windows Desktop',
            docHash: 'sha256:abc123',
          },
        });
      }
    }

    const historyActions = [
      'Created',
      'Sent for review',
      'Signed by HOD',
      'Signed by Finance',
      'Signed by GM',
      'Published',
    ];

    for (const action of historyActions) {
      const exists = await prisma.documentHistory.findFirst({
        where: { documentId: publishedDoc.id, action },
      });
      if (!exists) {
        await prisma.documentHistory.create({
          data: {
            documentId: publishedDoc.id,
            action,
            userName: 'Fuad Ahmadov',
          },
        });
      }
    }
  }

  const fuad = userByEmail['fuad.ahmadov@hoterra.az'];
  const notificationSamples = [
    { title: 'Document approved', message: 'Q2 Financial Report has been approved by Finance Director', type: 'document', link: '/documents' },
    { title: 'Approval required', message: 'Guest Check-in Procedure requires your review', type: 'workflow', link: '/approvals' },
    { title: 'Document updated', message: 'Housekeeping Cleaning Checklist was updated', type: 'document', link: '/documents' },
    { title: 'New user added', message: 'A new user was added to Front Office department', type: 'system', link: '/users' },
    { title: 'Review due soon', message: 'Credit Card Handling Procedure review due in 7 days', type: 'document', link: '/documents' },
    { title: 'Workflow completed', message: 'Vendor Agreement workflow completed successfully', type: 'workflow', link: '/workflows' },
    { title: 'Security alert', message: 'New login from Windows Desktop', type: 'security', link: '/audit' },
    { title: 'Template published', message: 'SOP Standard Template v2.1 published', type: 'template', link: '/templates' },
  ];

  for (const [i, n] of notificationSamples.entries()) {
    const exists = await prisma.notification.findFirst({
      where: { userId: fuad.id, title: n.title },
    });
    if (!exists) {
      await prisma.notification.create({
        data: {
          userId: fuad.id,
          title: n.title,
          message: n.message,
          type: n.type,
          link: n.link,
          isRead: i >= 3,
        },
      });
    }
  }

  for (const log of [
    {
      userName: 'Fuad Ahmadov',
      action: AuditAction.PUBLISH,
      entityType: 'Document',
      details: 'Published "Credit Card Handling Procedure"',
    },
    {
      userName: 'Nigar Rustamova',
      action: AuditAction.APPROVE,
      entityType: 'Document',
      details: 'Approved "Vendor Agreement Template"',
    },
    {
      userName: 'Elnur Mahmudov',
      action: AuditAction.REJECT,
      entityType: 'Document',
      details: 'Requested changes to "Budget Planning Form"',
    },
  ]) {
    await prisma.auditLog.create({ data: log });
  }

  console.log('Seed completed successfully!');
  console.log('');
  console.log('Demo accounts (password: password123, PIN: 1234):');
  console.log('  GM:       fuad.ahmadov@hoterra.az');
  console.log('  HOD:      nigar.rustamova@hoterra.az');
  console.log('  Finance:  elnur.mahmudov@hoterra.az');
  console.log('  Employee: employee@hoterra.az');
  console.log('  Admin:    admin@hoterra.az');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
