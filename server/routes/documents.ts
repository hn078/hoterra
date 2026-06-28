import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { DocumentStatus, Prisma, Role, AuditAction, DocumentPriority } from '@prisma/client';
import { prisma } from '../db';
import { authMiddleware, canViewAllDocuments } from '../middleware/auth';
import { routeParam } from '../utils';
import {
  expectedSignerRole,
  parseSignaturePlacements,
  serializeSignaturePlacements,
  DEFAULT_SIGNATURE_PLACEMENTS,
} from '../lib/signatures';
import { getUploadsDir } from '../lib/paths';

const router = Router();

function parseTags(tags: string): string[] {
  try {
    return JSON.parse(tags);
  } catch {
    return [];
  }
}

router.get('/', authMiddleware, async (req: Request, res: Response) => {
  const {
    search,
    departmentId,
    category,
    status,
    authorId,
    page = '1',
    limit = '20',
  } = req.query;

  const where: Prisma.DocumentWhereInput = {};

  if (!canViewAllDocuments(req.user!.role)) {
    where.departmentId = req.user!.departmentId ?? undefined;
  } else if (departmentId) {
    where.departmentId = String(departmentId);
  }

  if (category) where.category = category as Prisma.EnumDocumentCategoryFilter;
  if (status) where.status = status as DocumentStatus;
  if (authorId) where.authorId = String(authorId);

  if (req.query.priority) where.priority = String(req.query.priority) as DocumentPriority;

  if (search) {
    const q = String(search);
    where.OR = [
      { title: { contains: q } },
      { code: { contains: q } },
      { description: { contains: q } },
    ];
  }

  const pageNum = Math.max(1, parseInt(String(page), 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10)));
  const skip = (pageNum - 1) * limitNum;

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      include: {
        department: true,
        author: { select: { id: true, firstName: true, lastName: true } },
        owner: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip,
      take: limitNum,
    }),
    prisma.document.count({ where }),
  ]);

  res.json({
    data: documents.map((d) => ({ ...d, tags: parseTags(d.tags) })),
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  });
});

router.get('/approvals', authMiddleware, async (req: Request, res: Response) => {
  const { tab = 'pending', page = '1', limit = '20' } = req.query;
  const pageNum = Math.max(1, parseInt(String(page), 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10)));

  const pendingStatuses: DocumentStatus[] = [
    DocumentStatus.IN_REVIEW,
    DocumentStatus.SIGNED_HOD,
    DocumentStatus.SIGNED_FINANCE,
    DocumentStatus.SIGNED_GM,
  ];

  let statusFilter: DocumentStatus[] | DocumentStatus | undefined;
  if (tab === 'pending') statusFilter = pendingStatuses;
  else if (tab === 'approved') statusFilter = DocumentStatus.PUBLISHED;
  else if (tab === 'rejected') statusFilter = DocumentStatus.REJECTED;
  else if (tab === 'returned') statusFilter = DocumentStatus.NEEDS_REVIEW;
  else if (tab === 'completed') statusFilter = [DocumentStatus.PUBLISHED, DocumentStatus.ARCHIVED];

  const where: Prisma.DocumentWhereInput = {
    ...(Array.isArray(statusFilter)
      ? { status: { in: statusFilter } }
      : statusFilter
        ? { status: statusFilter }
        : {}),
  };

  if (!canViewAllDocuments(req.user!.role)) {
    where.departmentId = req.user!.departmentId ?? undefined;
  }

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      include: {
        department: true,
        author: { select: { id: true, firstName: true, lastName: true, role: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    }),
    prisma.document.count({ where }),
  ]);

  const counts = await Promise.all([
    prisma.document.count({ where: { status: { in: pendingStatuses } } }),
    prisma.document.count({ where: { status: DocumentStatus.PUBLISHED } }),
    prisma.document.count({ where: { status: DocumentStatus.REJECTED } }),
    prisma.document.count({ where: { status: DocumentStatus.NEEDS_REVIEW } }),
    prisma.document.count({
      where: { status: { in: [DocumentStatus.PUBLISHED, DocumentStatus.ARCHIVED] } },
    }),
  ]);

  res.json({
    data: documents.map((d) => ({ ...d, tags: parseTags(d.tags) })),
    counts: {
      pending: counts[0],
      approved: counts[1],
      rejected: counts[2],
      returned: counts[3],
      completed: counts[4],
    },
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  });
});

router.get('/stats', authMiddleware, async (req: Request, res: Response) => {
  const deptFilter = canViewAllDocuments(req.user!.role)
    ? {}
    : { departmentId: req.user!.departmentId ?? undefined };

  const now = new Date();

  const [
    pendingApproval,
    overdue,
    dueForReview,
    published,
    archived,
    byStatus,
    byDepartment,
    recentActivity,
    upcomingReviews,
    trendDocs,
  ] = await Promise.all([
    prisma.document.count({
      where: {
        ...deptFilter,
        status: {
          in: [
            DocumentStatus.IN_REVIEW,
            DocumentStatus.SIGNED_HOD,
            DocumentStatus.SIGNED_FINANCE,
            DocumentStatus.SIGNED_GM,
          ],
        },
      },
    }),
    prisma.document.count({
      where: {
        ...deptFilter,
        nextReviewDate: { lt: now },
        status: { not: DocumentStatus.ARCHIVED },
      },
    }),
    prisma.document.count({
      where: {
        ...deptFilter,
        nextReviewDate: {
          gte: now,
          lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        },
        status: DocumentStatus.PUBLISHED,
      },
    }),
    prisma.document.count({
      where: { ...deptFilter, status: DocumentStatus.PUBLISHED },
    }),
    prisma.document.count({
      where: { ...deptFilter, status: DocumentStatus.ARCHIVED },
    }),
    prisma.document.groupBy({
      by: ['status'],
      where: deptFilter,
      _count: true,
    }),
    prisma.document.groupBy({
      by: ['departmentId'],
      where: deptFilter,
      _count: true,
    }),
    prisma.documentHistory.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        document: { select: { title: true, code: true } },
      },
    }),
    prisma.document.findMany({
      where: {
        ...deptFilter,
        nextReviewDate: { gte: now },
        status: DocumentStatus.PUBLISHED,
      },
      orderBy: { nextReviewDate: 'asc' },
      take: 5,
      include: { department: true },
    }),
    prisma.document.findMany({
      where: { ...deptFilter, createdAt: { gte: new Date(now.getFullYear(), now.getMonth() - 5, 1) } },
      select: { createdAt: true, status: true },
    }),
  ]);

  const departments = await prisma.department.findMany();
  const deptMap = Object.fromEntries(departments.map((d) => [d.id, d]));

  const trendMap = new Map<string, { created: number; published: number }>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - i);
    const key = d.toLocaleString('en', { month: 'short' });
    trendMap.set(key, { created: 0, published: 0 });
  }
  for (const doc of trendDocs) {
    const key = doc.createdAt.toLocaleString('en', { month: 'short' });
    if (trendMap.has(key)) {
      trendMap.get(key)!.created++;
      if (doc.status === DocumentStatus.PUBLISHED) trendMap.get(key)!.published++;
    }
  }

  res.json({
    cards: {
      pendingApproval,
      overdue,
      dueForReview,
      published,
      archived,
    },
    byStatus: byStatus.map((s) => ({
      status: s.status,
      count: s._count,
    })),
    byDepartment: byDepartment.map((d) => ({
      department: deptMap[d.departmentId]?.name ?? 'Unknown',
      departmentId: d.departmentId,
      count: d._count,
      color: deptMap[d.departmentId]?.color,
    })),
    recentActivity,
    upcomingReviews: upcomingReviews.map((d) => ({
      id: d.id,
      title: d.title,
      department: d.department.name,
      category: d.category,
      nextReviewDate: d.nextReviewDate,
    })),
    trend: Array.from(trendMap.entries()).map(([month, v]) => ({ month, ...v })),
  });
});

router.get('/export/csv', authMiddleware, async (req: Request, res: Response) => {
  const { status, departmentId } = req.query;
  const where: Prisma.DocumentWhereInput = {};
  if (status) where.status = status as DocumentStatus;
  if (departmentId) where.departmentId = String(departmentId);

  const docs = await prisma.document.findMany({
    where,
    include: { department: true, author: { select: { firstName: true, lastName: true } } },
    orderBy: { updatedAt: 'desc' },
    take: 5000,
  });

  const header = 'Code,Title,Department,Category,Status,Version,Author,Updated\n';
  const rows = docs
    .map((d) =>
      [
        d.code,
        `"${d.title.replace(/"/g, '""')}"`,
        d.department.name,
        d.category,
        d.status,
        d.version,
        `${d.author.firstName} ${d.author.lastName}`,
        d.updatedAt.toISOString(),
      ].join(',')
    )
    .join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=documents.csv');
  res.send(header + rows);
});

router.post('/bulk/archive', authMiddleware, async (req: Request, res: Response) => {
  const { ids, reason } = req.body as { ids: string[]; reason?: string };
  if (!ids?.length) return res.status(400).json({ error: 'ids required' });

  const allowed: Role[] = [Role.HOD, Role.GENERAL_MANAGER, Role.SYSTEM_ADMINISTRATOR];
  if (!allowed.includes(req.user!.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await prisma.document.updateMany({
    where: { id: { in: ids } },
    data: {
      status: DocumentStatus.ARCHIVED,
      archiveReason: reason || 'Bulk archived',
      archivedAt: new Date(),
      archivedBy: `${req.user!.firstName} ${req.user!.lastName}`,
    },
  });

  res.json({ ok: true, count: ids.length });
});

router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  const id = routeParam(req.params.id);
  const document = await prisma.document.findUnique({
    where: { id },
    include: {
      department: true,
      author: { select: { id: true, firstName: true, lastName: true, role: true } },
      owner: { select: { id: true, firstName: true, lastName: true, role: true } },
      history: { orderBy: { createdAt: 'desc' } },
      signatures: {
        include: {
          user: { select: { firstName: true, lastName: true, role: true } },
        },
        orderBy: { signedAt: 'asc' },
      },
      versions: { orderBy: { createdAt: 'desc' } },
      comments: {
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
      },
      attachments: { orderBy: { createdAt: 'desc' } },
      workflow: true,
    },
  });

  if (!document) {
    return res.status(404).json({ error: 'Document not found' });
  }

  if (
    !canViewAllDocuments(req.user!.role) &&
    document.departmentId !== req.user!.departmentId
  ) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  res.json({ ...document, tags: parseTags(document.tags) });
});

router.get('/:id/related', authMiddleware, async (req: Request, res: Response) => {
  const id = routeParam(req.params.id);
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return res.status(404).json({ error: 'Not found' });

  const related = await prisma.document.findMany({
    where: {
      id: { not: id },
      OR: [
        { departmentId: doc.departmentId },
        { category: doc.category },
        { tags: { contains: doc.tags.slice(1, 10) } },
      ],
    },
    include: {
      department: true,
      author: { select: { firstName: true, lastName: true } },
    },
    take: 10,
    orderBy: { updatedAt: 'desc' },
  });

  res.json(related.map((d) => ({ ...d, tags: parseTags(d.tags) })));
});

router.post('/:id/sign', authMiddleware, async (req: Request, res: Response) => {
  const id = routeParam(req.params.id);
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ error: 'PIN required' });

  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user?.pinHash) return res.status(400).json({ error: 'PIN not configured' });

  const valid = await bcrypt.compare(String(pin), user.pinHash);
  if (!valid) return res.status(401).json({ error: 'Invalid PIN' });

  if (!user.signatureImage) {
    return res.status(400).json({ error: 'Upload your signature image in your profile before signing' });
  }

  const doc = await prisma.document.findUnique({
    where: { id },
    include: { signatures: true },
  });
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  const expectedRole = expectedSignerRole(doc.status);
  if (expectedRole && user.role !== expectedRole && user.role !== Role.SYSTEM_ADMINISTRATOR) {
    return res.status(403).json({ error: `This document requires signature from ${ROLE_LABEL(expectedRole)}` });
  }

  const placements = parseSignaturePlacements(doc.signaturePlacement);
  const signedPlacementIds = new Set(
    doc.signatures.map((s) => s.placementId).filter(Boolean) as string[]
  );
  const placement =
    placements.find((p) => p.role === user.role && !signedPlacementIds.has(p.id)) ??
    placements.find((p) => p.role === user.role);

  const positionMap: Partial<Record<Role, string>> = {
    HOD: 'Head of Department',
    FINANCE_DIRECTOR: 'Finance Director',
    GENERAL_MANAGER: 'General Manager',
    SYSTEM_ADMINISTRATOR: 'System Administrator',
  };

  const signature = await prisma.signature.create({
    data: {
      documentId: id,
      userId: user.id,
      fullName: `${user.firstName} ${user.lastName}`,
      position: positionMap[user.role] || ROLE_LABEL(user.role),
      ipAddress: req.ip,
      device: String(req.headers['user-agent'] ?? 'Web'),
      docHash: `sha256:${Buffer.from(doc.title + doc.version).toString('base64').slice(0, 32)}`,
      imagePath: user.signatureImage,
      placementId: placement?.id ?? null,
      page: placement?.page === 'all' ? null : (placement?.page ?? doc.pageCount),
    },
  });

  const flow: Partial<Record<DocumentStatus, DocumentStatus>> = {
    IN_REVIEW: DocumentStatus.SIGNED_HOD,
    SIGNED_HOD: DocumentStatus.SIGNED_FINANCE,
    SIGNED_FINANCE: DocumentStatus.SIGNED_GM,
    SIGNED_GM: DocumentStatus.PUBLISHED,
  };
  const newStatus = flow[doc.status];

  if (newStatus) {
    await prisma.document.update({
      where: { id },
      data: {
        status: newStatus,
        ...(newStatus === DocumentStatus.PUBLISHED ? { isLocked: true } : {}),
      },
    });
  }

  await prisma.documentHistory.create({
    data: {
      documentId: id,
      action: `Signed by ${user.firstName} ${user.lastName}`,
      userId: user.id,
      userName: `${user.firstName} ${user.lastName}`,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      userName: `${user.firstName} ${user.lastName}`,
      action: AuditAction.SIGN,
      entityType: 'Document',
      entityId: id,
      details: `Signed "${doc.title}"`,
    },
  });

  res.json(signature);
});

function ROLE_LABEL(role: Role): string {
  const labels: Record<Role, string> = {
    EMPLOYEE: 'Employee',
    SUPERVISOR: 'Supervisor',
    HOD: 'Head of Department',
    FINANCE_DIRECTOR: 'Finance Director',
    GENERAL_MANAGER: 'General Manager',
    SYSTEM_ADMINISTRATOR: 'Administrator',
  };
  return labels[role];
}

router.post('/', authMiddleware, async (req: Request, res: Response) => {
  const {
    title,
    code,
    category,
    departmentId,
    description,
    content,
    version,
    nextReviewDate,
    effectiveDate,
    ownerId,
    language,
    tags,
    templateId,
    workflowId,
    priority,
    allowDownload,
    allowComments,
    status,
  } = req.body;

  if (!title || !category || !departmentId) {
    return res.status(400).json({ error: 'Title, category and department required' });
  }

  const dept = await prisma.department.findUnique({ where: { id: departmentId } });
  if (!dept) {
    return res.status(400).json({ error: 'Invalid department' });
  }

  const docCode =
    code ||
    `${dept.code}-${category.slice(0, 3).toUpperCase()}-${String(
      (await prisma.document.count({ where: { departmentId } })) + 1
    ).padStart(3, '0')}`;

  let signaturePlacement = serializeSignaturePlacements(DEFAULT_SIGNATURE_PLACEMENTS);
  let pageCount = 1;
  let docContent = content || null;

  if (templateId) {
    const template = await prisma.template.findUnique({ where: { id: templateId } });
    if (template) {
      const placements = parseSignaturePlacements(template.signaturePlacement);
      signaturePlacement = serializeSignaturePlacements(
        placements.length ? placements : DEFAULT_SIGNATURE_PLACEMENTS
      );
      pageCount = template.pageCount || 1;
      if (!docContent && template.content) docContent = template.content;
    }
  }

  const document = await prisma.document.create({
    data: {
      title,
      code: docCode,
      category,
      departmentId,
      description,
      version: version || '1.0',
      nextReviewDate: nextReviewDate ? new Date(nextReviewDate) : null,
      effectiveDate: effectiveDate ? new Date(effectiveDate) : null,
      ownerId: ownerId || req.user!.id,
      authorId: req.user!.id,
      language: language || 'English',
      tags: JSON.stringify(tags || []),
      templateId,
      workflowId: workflowId || null,
      content: docContent,
      signaturePlacement,
      pageCount,
      priority: priority || DocumentPriority.MEDIUM,
      allowDownload: allowDownload !== false,
      allowComments: allowComments !== false,
      status: status === 'IN_REVIEW' ? DocumentStatus.IN_REVIEW : DocumentStatus.DRAFT,
    },
    include: {
      department: true,
      author: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  await prisma.documentHistory.create({
    data: {
      documentId: document.id,
      action: 'Created',
      userId: req.user!.id,
      userName: `${req.user!.firstName} ${req.user!.lastName}`,
    },
  });

  res.status(201).json({ ...document, tags: tags || [] });
});

router.patch('/:id', authMiddleware, async (req: Request, res: Response) => {
  const id = routeParam(req.params.id);
  const existing = await prisma.document.findUnique({ where: { id } });

  if (!existing) {
    return res.status(404).json({ error: 'Document not found' });
  }

  if (existing.isLocked) {
    return res.status(400).json({ error: 'Document is locked after signing' });
  }

  const { title, description, status, tags, nextReviewDate, effectiveDate, version } =
    req.body;

  const document = await prisma.document.update({
    where: { id },
    data: {
      ...(title && { title }),
      ...(description !== undefined && { description }),
      ...(status && { status }),
      ...(tags && { tags: JSON.stringify(tags) }),
      ...(nextReviewDate && { nextReviewDate: new Date(nextReviewDate) }),
      ...(effectiveDate && { effectiveDate: new Date(effectiveDate) }),
      ...(version && { version }),
    },
    include: { department: true, author: true },
  });

  await prisma.documentHistory.create({
    data: {
      documentId: document.id,
      action: 'Updated',
      userId: req.user!.id,
      userName: `${req.user!.firstName} ${req.user!.lastName}`,
    },
  });

  res.json({ ...document, tags: parseTags(document.tags) });
});

router.post('/:id/approve', authMiddleware, async (req: Request, res: Response) => {
  const id = routeParam(req.params.id);
  const { action, comment } = req.body as {
    action: 'approve' | 'reject' | 'request_changes';
    comment?: string;
  };

  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  let newStatus: DocumentStatus;
  let historyAction: string;

  if (action === 'reject') {
    newStatus = DocumentStatus.REJECTED;
    historyAction = 'Rejected';
  } else if (action === 'request_changes') {
    newStatus = DocumentStatus.NEEDS_REVIEW;
    historyAction = 'Returned for changes';
  } else {
    const flow: Partial<Record<DocumentStatus, DocumentStatus>> = {
      [DocumentStatus.DRAFT]: DocumentStatus.IN_REVIEW,
      [DocumentStatus.IN_REVIEW]: DocumentStatus.SIGNED_HOD,
      [DocumentStatus.SIGNED_HOD]: DocumentStatus.SIGNED_FINANCE,
      [DocumentStatus.SIGNED_FINANCE]: DocumentStatus.SIGNED_GM,
      [DocumentStatus.SIGNED_GM]: DocumentStatus.PUBLISHED,
      [DocumentStatus.NEEDS_REVIEW]: DocumentStatus.IN_REVIEW,
    };
    newStatus = flow[doc.status] ?? DocumentStatus.PUBLISHED;
    historyAction = 'Approved';
  }

  const updated = await prisma.document.update({
    where: { id },
    data: {
      status: newStatus,
      ...(newStatus === DocumentStatus.PUBLISHED ? { isLocked: true } : {}),
    },
    include: {
      department: true,
      author: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  await prisma.documentHistory.create({
    data: {
      documentId: id,
      action: historyAction,
      details: comment || undefined,
      userId: req.user!.id,
      userName: `${req.user!.firstName} ${req.user!.lastName}`,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      userName: `${req.user!.firstName} ${req.user!.lastName}`,
      action:
        action === 'reject' || action === 'request_changes'
          ? AuditAction.REJECT
          : AuditAction.APPROVE,
      entityType: 'Document',
      entityId: id,
      details: `${historyAction}: ${doc.title}${comment ? ` — ${comment}` : ''}`,
    },
  });

  if (doc.authorId !== req.user!.id) {
    await prisma.notification.create({
      data: {
        userId: doc.authorId,
        title: `Document ${historyAction.toLowerCase()}`,
        message: `"${doc.title}" was ${historyAction.toLowerCase()} by ${req.user!.firstName} ${req.user!.lastName}`,
        type: 'document',
        link: `/documents/${id}`,
      },
    });
  }

  res.json({ ...updated, tags: parseTags(updated.tags) });
});

router.post('/:id/restore', authMiddleware, async (req: Request, res: Response) => {
  const id = routeParam(req.params.id);
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  if (doc.status !== DocumentStatus.ARCHIVED) {
    return res.status(400).json({ error: 'Document is not archived' });
  }

  const updated = await prisma.document.update({
    where: { id },
    data: { status: DocumentStatus.DRAFT, isLocked: false },
    include: { department: true, author: true },
  });

  await prisma.documentHistory.create({
    data: {
      documentId: id,
      action: 'Restored from archive',
      userId: req.user!.id,
      userName: `${req.user!.firstName} ${req.user!.lastName}`,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      userName: `${req.user!.firstName} ${req.user!.lastName}`,
      action: AuditAction.UPDATE,
      entityType: 'Document',
      entityId: id,
      details: `Restored "${doc.title}" from archive`,
    },
  });

  res.json({ ...updated, tags: parseTags(updated.tags) });
});

router.post('/:id/archive', authMiddleware, async (req: Request, res: Response) => {
  const id = routeParam(req.params.id);
  const allowed: Role[] = [Role.HOD, Role.GENERAL_MANAGER, Role.SYSTEM_ADMINISTRATOR];
  if (!allowed.includes(req.user!.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { reason } = req.body;

  const document = await prisma.document.update({
    where: { id },
    data: {
      status: DocumentStatus.ARCHIVED,
      archiveReason: reason || 'Archived by user',
      archivedAt: new Date(),
      archivedBy: `${req.user!.firstName} ${req.user!.lastName}`,
    },
  });

  await prisma.documentHistory.create({
    data: {
      documentId: document.id,
      action: 'Archived',
      userId: req.user!.id,
      userName: `${req.user!.firstName} ${req.user!.lastName}`,
    },
  });

  res.json(document);
});

router.get('/:id/comments', authMiddleware, async (req: Request, res: Response) => {
  const id = routeParam(req.params.id);
  const comments = await prisma.documentComment.findMany({
    where: { documentId: id },
    include: { user: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(comments);
});

router.post('/:id/comments', authMiddleware, async (req: Request, res: Response) => {
  const id = routeParam(req.params.id);
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'Comment text required' });

  const comment = await prisma.documentComment.create({
    data: {
      documentId: id,
      userId: req.user!.id,
      text: text.trim(),
    },
    include: { user: { select: { id: true, firstName: true, lastName: true } } },
  });
  res.status(201).json(comment);
});

router.patch('/:id/comments/:commentId', authMiddleware, async (req: Request, res: Response) => {
  const { status } = req.body;
  const comment = await prisma.documentComment.update({
    where: { id: routeParam(req.params.commentId) },
    data: { status },
    include: { user: { select: { id: true, firstName: true, lastName: true } } },
  });
  res.json(comment);
});

router.post('/:id/upload', authMiddleware, async (req: Request, res: Response) => {
  const id = routeParam(req.params.id);
  const { fileName, fileType, data, isAttachment } = req.body;
  if (!fileName || !data) return res.status(400).json({ error: 'fileName and data required' });

  const uploadsDir = getUploadsDir();

  const ext = path.extname(fileName) || '.bin';
  const storedName = `${uuidv4()}${ext}`;
  const filePath = path.join(uploadsDir, storedName);
  const buffer = Buffer.from(data, 'base64');
  fs.writeFileSync(filePath, buffer);

  if (isAttachment) {
    const attachment = await prisma.documentAttachment.create({
      data: {
        documentId: id,
        fileName,
        filePath: `/uploads/${storedName}`,
        fileSize: buffer.length,
        fileType: fileType || ext.replace('.', ''),
      },
    });
    return res.status(201).json(attachment);
  }

  const updated = await prisma.document.update({
    where: { id },
    data: {
      fileName,
      filePath: `/uploads/${storedName}`,
      fileType: fileType || ext.replace('.', ''),
      fileSize: buffer.length,
    },
  });
  res.json({ ...updated, tags: parseTags(updated.tags) });
});

router.post('/:id/version', authMiddleware, async (req: Request, res: Response) => {
  const id = routeParam(req.params.id);
  const { version, changeNote } = req.body;
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  const newVersion = version || String(parseFloat(doc.version) + 0.1);
  await prisma.documentVersion.create({
    data: {
      documentId: id,
      version: doc.version,
      filePath: doc.filePath,
      changeNote,
      createdBy: req.user!.id,
    },
  });

  const updated = await prisma.document.update({
    where: { id },
    data: { version: newVersion, status: DocumentStatus.DRAFT, isLocked: false },
    include: { department: true, author: true },
  });

  await prisma.documentHistory.create({
    data: {
      documentId: id,
      action: `New version ${newVersion}`,
      userId: req.user!.id,
      userName: `${req.user!.firstName} ${req.user!.lastName}`,
    },
  });

  res.json({ ...updated, tags: parseTags(updated.tags) });
});

router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  const id = routeParam(req.params.id);
  const role = req.user!.role;
  if (role !== Role.SYSTEM_ADMINISTRATOR && role !== Role.GENERAL_MANAGER) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return res.status(404).json({ error: 'Not found' });
  if (doc.status !== DocumentStatus.ARCHIVED) {
    return res.status(400).json({ error: 'Only archived documents can be permanently deleted' });
  }

  await prisma.document.delete({ where: { id } });
  res.json({ ok: true });
});

export default router;
