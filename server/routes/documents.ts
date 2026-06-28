import { Router, Request, Response } from 'express';
import { DocumentStatus, Prisma, Role } from '@prisma/client';
import { prisma } from '../db';
import { authMiddleware, canViewAllDocuments } from '../middleware/auth';
import { routeParam } from '../utils';

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
  ]);

  const departments = await prisma.department.findMany();
  const deptMap = Object.fromEntries(departments.map((d) => [d.id, d]));

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
  });
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

router.post('/', authMiddleware, async (req: Request, res: Response) => {
  const {
    title,
    code,
    category,
    departmentId,
    description,
    version,
    nextReviewDate,
    effectiveDate,
    ownerId,
    language,
    tags,
    templateId,
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
      status: DocumentStatus.DRAFT,
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

router.post('/:id/archive', authMiddleware, async (req: Request, res: Response) => {
  const id = routeParam(req.params.id);
  const allowed: Role[] = [Role.HOD, Role.GENERAL_MANAGER, Role.SYSTEM_ADMINISTRATOR];
  if (!allowed.includes(req.user!.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const document = await prisma.document.update({
    where: { id },
    data: { status: DocumentStatus.ARCHIVED },
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

export default router;
