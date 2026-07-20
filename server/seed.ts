import bcrypt from 'bcryptjs';
import {
  PrismaClient,
  Role,
  DocumentStatus,
  DocumentCategory,
  DocumentPriority,
  AuditAction,
  ConversationType,
} from '@prisma/client';
import { DEFAULT_SIGNATURE_PLACEMENTS, serializeSignaturePlacements } from './lib/signatures';

const DEFAULT_PLACEMENT_JSON = serializeSignaturePlacements(DEFAULT_SIGNATURE_PLACEMENTS);

const prisma = new PrismaClient();

const DEPARTMENTS = [
  { name: 'General Management', code: 'GM', color: '#6B7280', location: 'Head Office', description: 'Executive leadership and corporate governance.' },
  { name: 'Front Office', code: 'FO', color: '#3B82F6', location: 'Main Hotel', description: 'Guest services, reservations and front desk operations.' },
  { name: 'Housekeeping', code: 'HK', color: '#10B981', location: 'Main Hotel', description: 'Room cleaning, laundry and guest room standards.' },
  { name: 'Finance', code: 'FI', color: '#8B5CF6', location: 'Head Office', description: 'Financial planning, accounting and budget control.' },
  { name: 'Human Resources', code: 'HR', color: '#F97316', location: 'Head Office', description: 'Recruitment, training and employee relations.' },
  { name: 'Sales & Marketing', code: 'SM', color: '#06B6D4', location: 'Main Hotel', description: 'Sales, marketing and guest relations.' },
  { name: 'Engineering', code: 'EN', color: '#14B8A6', location: 'Main Hotel', description: 'Maintenance and technical operations.' },
  { name: 'Security', code: 'SC', color: '#1E3A5F', location: 'Main Hotel', description: 'Safety, security and emergency procedures.' },
  { name: 'Procurement', code: 'PR', color: '#EAB308', location: 'Head Office', description: 'Purchasing and vendor management.' },
  { name: 'Food & Beverage', code: 'FB', color: '#EF4444', location: 'Main Hotel', description: 'Restaurant, bar and banquet operations.' },
  { name: 'Kitchen', code: 'KT', color: '#EC4899', location: 'Main Hotel', description: 'Kitchen operations and food preparation.' },
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
      update: { location: dept.location, description: dept.description },
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
      await prisma.template.create({
        data: {
          ...t,
          version: '1.0',
          status: 'Active',
          departmentId: deptByCode.FO.id,
          signaturePlacement: DEFAULT_PLACEMENT_JSON,
          pageCount: 3,
        },
      });
    } else {
      await prisma.template.update({
        where: { id: existing.id },
        data: { signaturePlacement: DEFAULT_PLACEMENT_JSON, pageCount: 3 },
      });
    }
  }

  const standardWorkflow = await prisma.workflowRoute.findUnique({ where: { id: 'standard' } });

  await prisma.systemSettings.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default' },
  });

  await prisma.workflowRoute.upsert({
    where: { id: 'standard' },
    update: { status: 'ACTIVE' },
    create: {
      id: 'standard',
      name: 'Standard Route',
      description: 'Author → HOD → Finance → GM',
      steps: JSON.stringify([
        { id: 'step-hod', type: 'APPROVAL', role: 'HOD', label: 'Head of Department' },
        { id: 'step-finance', type: 'APPROVAL', role: 'FINANCE_DIRECTOR', label: 'Finance Director' },
        { id: 'step-gm', type: 'APPROVAL', role: 'GENERAL_MANAGER', label: 'General Manager' },
      ]),
      isDefault: true,
      status: 'ACTIVE',
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
      nextReviewDate: new Date('2026-07-12'),
      effectiveDate: new Date('2025-06-12'),
      isLocked: true,
      priority: DocumentPriority.HIGH,
      workflowId: 'standard',
      content: '1. PURPOSE\nSecure handling of guest credit card information.\n\n2. SCOPE\nAll front office staff.',
      fileName: 'Credit_Card_Handling_Procedure_v2.1.pdf',
      fileType: 'pdf',
      fileSize: 1258291,
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
      nextReviewDate: new Date('2026-07-15'),
      priority: DocumentPriority.MEDIUM,
      workflowId: 'standard',
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
      priority: DocumentPriority.HIGH,
      workflowId: 'standard',
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
      priority: DocumentPriority.MEDIUM,
      workflowId: 'standard',
    },
    {
      title: 'Legacy Guest Registration Form',
      code: 'FO-FRM-099',
      category: DocumentCategory.FORMS,
      departmentId: deptByCode.FO.id,
      authorId: userByEmail['nigar.rustamova@hoterra.az'].id,
      ownerId: userByEmail['nigar.rustamova@hoterra.az'].id,
      status: DocumentStatus.ARCHIVED,
      version: '1.0',
      archiveReason: 'Replaced by new digital form',
      archivedAt: new Date('2024-11-15'),
      archivedBy: 'Nigar Rustamova',
      fileSize: 1258291,
      priority: DocumentPriority.LOW,
    },
    {
      title: '2019 Fire Safety Manual',
      code: 'SC-POL-012',
      category: DocumentCategory.POLICIES,
      departmentId: deptByCode.SC.id,
      authorId: userByEmail['fuad.ahmadov@hoterra.az'].id,
      ownerId: userByEmail['fuad.ahmadov@hoterra.az'].id,
      status: DocumentStatus.ARCHIVED,
      version: '1.0',
      archiveReason: 'Superseded by 2024 edition',
      archivedAt: new Date('2024-09-20'),
      archivedBy: 'Fuad Ahmadov',
      fileSize: 5033164,
      priority: DocumentPriority.MEDIUM,
    },
  ];

  for (const doc of sampleDocs) {
    await prisma.document.upsert({
      where: { code: doc.code },
      update: {
        workflowId: doc.workflowId ?? 'standard',
        nextReviewDate: doc.nextReviewDate ?? undefined,
        priority: doc.priority,
        content: doc.content,
        fileSize: doc.fileSize,
        archiveReason: doc.archiveReason,
        archivedAt: doc.archivedAt,
        archivedBy: doc.archivedBy,
        signaturePlacement: DEFAULT_PLACEMENT_JSON,
        pageCount: 3,
      },
      create: {
        ...doc,
        workflowId: doc.workflowId ?? 'standard',
        signaturePlacement: DEFAULT_PLACEMENT_JSON,
        pageCount: 3,
      },
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

  const reviewDoc = await prisma.document.findUnique({ where: { code: 'HK-CHK-012' } });
  if (reviewDoc) {
    const nigar = userByEmail['nigar.rustamova@hoterra.az'];
    const elnur = userByEmail['elnur.mahmudov@hoterra.az'];
    for (const [text, userId, status] of [
      ['Please review section 3.2 regarding PCI-DSS compliance requirements.', nigar.id, 'resolved'],
      ['Updated the escalation procedure. Ready for GM approval.', elnur.id, 'open'],
    ] as const) {
      const exists = await prisma.documentComment.findFirst({
        where: { documentId: reviewDoc.id, text },
      });
      if (!exists) {
        await prisma.documentComment.create({
          data: { documentId: reviewDoc.id, userId, text, status },
        });
      }
    }
  }

  if (publishedDoc) {
    for (const att of [
      { fileName: 'Credit Card Incident Log.xlsx', filePath: '/uploads/demo-incident-log.xlsx', fileSize: 250880, fileType: 'xlsx' },
      { fileName: 'Declined Card SOP.docx', filePath: '/uploads/demo-declined-sop.docx', fileSize: 131072, fileType: 'docx' },
    ]) {
      const exists = await prisma.documentAttachment.findFirst({
        where: { documentId: publishedDoc.id, fileName: att.fileName },
      });
      if (!exists) {
        await prisma.documentAttachment.create({ data: { documentId: publishedDoc.id, ...att } });
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

  const nigar = userByEmail['nigar.rustamova@hoterra.az'];
  const employee = userByEmail['employee@hoterra.az'];

  let hotelChat = await prisma.conversation.findFirst({ where: { type: ConversationType.HOTEL } });
  if (!hotelChat) {
    hotelChat = await prisma.conversation.create({ data: { type: ConversationType.HOTEL } });
  }

  const foDept = deptByCode.FO;
  let foChat = await prisma.conversation.findFirst({
    where: { type: ConversationType.DEPARTMENT, departmentId: foDept.id },
  });
  if (!foChat) {
    foChat = await prisma.conversation.create({
      data: { type: ConversationType.DEPARTMENT, departmentId: foDept.id },
    });
  }

  for (const u of [fuad, nigar, employee]) {
    await prisma.conversationParticipant.upsert({
      where: { conversationId_userId: { conversationId: hotelChat.id, userId: u.id } },
      create: { conversationId: hotelChat.id, userId: u.id },
      update: {},
    });
  }

  for (const u of [nigar, employee]) {
    await prisma.conversationParticipant.upsert({
      where: { conversationId_userId: { conversationId: foChat.id, userId: u.id } },
      create: { conversationId: foChat.id, userId: u.id },
      update: {},
    });
  }

  const existingHotelMsg = await prisma.message.count({ where: { conversationId: hotelChat.id } });
  if (existingHotelMsg === 0) {
    await prisma.message.create({
      data: {
        conversationId: hotelChat.id,
        senderId: fuad.id,
        content: 'Welcome to the hotel-wide chat. Use this channel for announcements and cross-department coordination.',
      },
    });

    const checkInDoc = await prisma.document.findUnique({ where: { code: 'FO-SOP-001' } });
    await prisma.message.create({
      data: {
        conversationId: foChat.id,
        senderId: nigar.id,
        content: 'Front Office team — please review the updated check-in SOP before your shift:',
        ...(checkInDoc ? { documentId: checkInDoc.id } : {}),
      },
    });
  }

  // ── Casual Workforce ──────────────────────────────────────────────
  await prisma.workforceSettings.upsert({
    where: { id: 'default' },
    update: {
      hotelsJson: JSON.stringify(['HOTERRA', 'HOTERRA Beach', 'HOTERRA City']),
      hotelName: 'HOTERRA',
      notifyEmail: true,
      notifyPush: true,
      payrollTolerancePct: 5,
    },
    create: {
      id: 'default',
      hotelName: 'HOTERRA',
      hotelsJson: JSON.stringify(['HOTERRA', 'HOTERRA Beach', 'HOTERRA City']),
      minLeadHours: 24,
      notifyEmail: true,
      notifyPush: true,
      payrollTolerancePct: 5,
    },
  });

  const positionNames = [
    'Room Attendant',
    'Public Area Attendant',
    'Steward',
    'Waiter/Waitress',
    'Banquet Waiter',
    'Bartender',
    'Cook',
    'Kitchen Helper',
    'Bellman',
    'Porter',
    'Houseman',
    'Laundry Attendant',
    'Technician',
    'Security Officer',
    'Receptionist',
    'Concierge',
    'Spa Therapist',
    'Lifeguard',
    'Driver',
  ];

  for (const name of positionNames) {
    await prisma.workforcePosition.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  for (const v of [
    { name: 'Vendor A', contactEmail: 'desk@vendora.az', phone: '+994 12 000 0001' },
    { name: 'Vendor B', contactEmail: 'ops@vendorb.az', phone: '+994 12 000 0002' },
    { name: 'Vendor C', contactEmail: 'booking@vendorc.az', phone: '+994 12 000 0003' },
  ]) {
    await prisma.vendor.upsert({
      where: { name: v.name },
      update: { contactEmail: v.contactEmail, phone: v.phone, isApproved: true },
      create: { ...v, isApproved: true },
    });
  }

  const routeDefs: { code: string; name: string; steps: { role: Role; label: string }[] }[] = [
    {
      code: 'HK',
      name: 'Housekeeping Casual Route',
      steps: [
        { role: Role.HOD, label: 'Executive Housekeeper' },
        { role: Role.FINANCE_DIRECTOR, label: 'Financial Controller' },
        { role: Role.GENERAL_MANAGER, label: 'General Manager' },
      ],
    },
    {
      code: 'FB',
      name: 'F&B Casual Route',
      steps: [
        { role: Role.HOD, label: 'Restaurant Manager / F&B Director' },
        { role: Role.FINANCE_DIRECTOR, label: 'Financial Controller' },
        { role: Role.GENERAL_MANAGER, label: 'General Manager' },
      ],
    },
    {
      code: 'EN',
      name: 'Engineering Casual Route',
      steps: [
        { role: Role.HOD, label: 'Chief Engineer' },
        { role: Role.FINANCE_DIRECTOR, label: 'Financial Controller' },
        { role: Role.GENERAL_MANAGER, label: 'General Manager' },
      ],
    },
    {
      code: 'FO',
      name: 'Front Office Casual Route',
      steps: [
        { role: Role.HOD, label: 'Front Office Manager' },
        { role: Role.FINANCE_DIRECTOR, label: 'Financial Controller' },
        { role: Role.GENERAL_MANAGER, label: 'General Manager' },
      ],
    },
  ];

  for (const rd of routeDefs) {
    const dept = deptByCode[rd.code];
    if (!dept) continue;
    await prisma.workforceApprovalRoute.upsert({
      where: { departmentId: dept.id },
      update: { name: rd.name, steps: JSON.stringify(rd.steps) },
      create: { departmentId: dept.id, name: rd.name, steps: JSON.stringify(rd.steps) },
    });
  }

  const now = new Date();
  for (const code of ['HK', 'FB', 'FO', 'EN']) {
    const dept = deptByCode[code];
    if (!dept) continue;
    await prisma.departmentCasualBudget.upsert({
      where: {
        departmentId_year_month: {
          departmentId: dept.id,
          year: now.getFullYear(),
          month: now.getMonth() + 1,
        },
      },
      update: { budgetAmount: 5000 },
      create: {
        departmentId: dept.id,
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        budgetAmount: 5000,
      },
    });
  }

  const waiter = await prisma.workforcePosition.findUnique({ where: { name: 'Waiter/Waitress' } });
  const receptionist = await prisma.workforcePosition.findUnique({ where: { name: 'Receptionist' } });
  const vendorA = await prisma.vendor.findUnique({ where: { name: 'Vendor A' } });
  const fbDept = deptByCode.FB;
  const foDeptForWf = deptByCode.FO;

  if (waiter && vendorA && fbDept) {
    const tmplExists = await prisma.workforceRequestTemplate.findFirst({
      where: { name: 'Friday banquet waiters' },
    });
    if (!tmplExists) {
      await prisma.workforceRequestTemplate.create({
        data: {
          name: 'Friday banquet waiters',
          departmentId: fbDept.id,
          positionId: waiter.id,
          shift: 'EVENING',
          quantity: 5,
          dayOfWeek: 5,
          comment: 'Recurring Friday banquet coverage',
          vendorMode: 'DIRECT',
          vendorId: vendorA.id,
          isRecurring: true,
          hotelName: 'HOTERRA',
        },
      });
    } else {
      await prisma.workforceRequestTemplate.update({
        where: { id: tmplExists.id },
        data: { isRecurring: true, hotelName: 'HOTERRA' },
      });
    }
  }

  if (receptionist && vendorA && foDeptForWf) {
    const existingReq = await prisma.workforceRequest.findUnique({ where: { code: 'CWR-00001' } });
    if (!existingReq) {
      const workDate = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      const steps = [
        { role: Role.HOD, label: 'Front Office Manager' },
        { role: Role.FINANCE_DIRECTOR, label: 'Financial Controller' },
        { role: Role.GENERAL_MANAGER, label: 'General Manager' },
      ];
      const req = await prisma.workforceRequest.create({
        data: {
          code: 'CWR-00001',
          hotelName: 'HOTERRA',
          departmentId: foDeptForWf.id,
          positionId: receptionist.id,
          workDate,
          shift: 'MORNING',
          startTime: '08:00',
          endTime: '16:00',
          quantity: 3,
          comment: 'Peak check-in coverage — demo request',
          vendorMode: 'DIRECT',
          vendorId: vendorA.id,
          status: 'PENDING',
          approvalSteps: JSON.stringify(steps),
          estimatedCost: 3 * 8 * 15,
          createdById: nigar.id,
        },
      });
      await prisma.workforceRequestEvent.create({
        data: {
          requestId: req.id,
          action: 'CREATED',
          details: 'Demo seed request',
          userId: nigar.id,
          userName: 'Nigar Rustamova',
        },
      });
    }
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
