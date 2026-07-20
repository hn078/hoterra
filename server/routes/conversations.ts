import { Router, Request, Response } from 'express';
import fs from 'fs';
import { ConversationType } from '@prisma/client';
import { prisma } from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { authMiddleware, canViewDocument } from '../middleware/auth';
import {
  canAccessConversation,
  conversationInclude,
  ensureDepartmentConversation,
  ensureHotelConversation,
  ensureParticipant,
  ensureUserConversations,
  findOrCreateDirectConversation,
  formatConversation,
  formatMessage,
  getUnreadCount,
  messageInclude,
} from '../lib/conversations';
import { resolveUploadPath, saveBase64Upload, UploadTooLargeError } from '../lib/uploads';

const router = Router();

router.get('/', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;

  await ensureUserConversations(user);

  const conversationIds: string[] = [(await ensureHotelConversation()).id];

  if (user.departmentId) {
    conversationIds.push((await ensureDepartmentConversation(user.departmentId)).id);
  }

  const directRows = await prisma.conversationParticipant.findMany({
    where: { userId: user.id, conversation: { type: ConversationType.DIRECT } },
    select: { conversationId: true },
  });
  conversationIds.push(...directRows.map((row) => row.conversationId));

  const rows = await prisma.conversation.findMany({
    where: { id: { in: conversationIds } },
    include: conversationInclude,
  });

  const participantMap = new Map(
    (
      await prisma.conversationParticipant.findMany({
        where: { userId: user.id, conversationId: { in: conversationIds } },
        select: { conversationId: true, lastReadAt: true },
      })
    ).map((row) => [row.conversationId, row.lastReadAt])
  );

  const conversations = await Promise.all(
    rows.map(async (row) =>
      formatConversation(
        row,
        user.id,
        await getUnreadCount(row.id, user.id, participantMap.get(row.id) ?? null)
      )
    )
  );

  const order = { HOTEL: 0, DEPARTMENT: 1, DIRECT: 2 };
  conversations.sort((a, b) => {
    const typeDiff = order[a.type] - order[b.type];
    if (typeDiff !== 0) return typeDiff;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  res.json(conversations);
}));

router.get('/unread-count', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  await ensureUserConversations(user);

  const conversationIds: string[] = [(await ensureHotelConversation()).id];
  if (user.departmentId) {
    conversationIds.push((await ensureDepartmentConversation(user.departmentId)).id);
  }

  const directRows = await prisma.conversationParticipant.findMany({
    where: { userId: user.id, conversation: { type: ConversationType.DIRECT } },
    select: { conversationId: true },
  });
  conversationIds.push(...directRows.map((row) => row.conversationId));

  const participants = await prisma.conversationParticipant.findMany({
    where: { userId: user.id, conversationId: { in: conversationIds } },
    select: { conversationId: true, lastReadAt: true },
  });

  let total = 0;
  for (const p of participants) {
    total += await getUnreadCount(p.conversationId, user.id, p.lastReadAt);
  }

  res.json({ count: total });
}));

router.post('/direct', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const { userId } = req.body as { userId?: string };

  if (!userId || userId === user.id) {
    return res.status(400).json({ error: 'Invalid user' });
  }

  const target = await prisma.user.findFirst({
    where: { id: userId, isActive: true },
  });
  if (!target) {
    return res.status(404).json({ error: 'User not found' });
  }

  const conversation = await findOrCreateDirectConversation(user.id, userId);
  await ensureParticipant(conversation.id, user.id);
  await ensureParticipant(conversation.id, userId);

  const full = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversation.id },
    include: conversationInclude,
  });

  const participant = await prisma.conversationParticipant.findUniqueOrThrow({
    where: { conversationId_userId: { conversationId: conversation.id, userId: user.id } },
  });

  res.json(formatConversation(
    full,
    user.id,
    await getUnreadCount(conversation.id, user.id, participant.lastReadAt)
  ));
}));

router.get('/:id/messages', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const conversationId = String(req.params.id);
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const before = req.query.before ? new Date(String(req.query.before)) : undefined;

  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation || !(await canAccessConversation(user, conversation))) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  await ensureParticipant(conversationId, user.id);

  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      ...(before ? { createdAt: { lt: before } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: messageInclude,
  });

  res.json({
    data: messages.reverse().map(formatMessage),
    hasMore: messages.length === limit,
  });
}));

router.post('/:id/messages', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const conversationId = String(req.params.id);
  const { content, documentId, file } = req.body as {
    content?: string;
    documentId?: string;
    file?: { fileName: string; fileType?: string; data: string };
  };

  const trimmed = content?.trim() ?? '';
  if (!trimmed && !documentId && !file) {
    return res.status(400).json({ error: 'Message content, document, or file attachment is required' });
  }

  if (documentId && file) {
    return res.status(400).json({ error: 'Cannot attach both a document reference and a file' });
  }

  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation || !(await canAccessConversation(user, conversation))) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  if (documentId) {
    const document = await prisma.document.findUnique({ where: { id: documentId } });
    if (!document || !canViewDocument(user, document)) {
      return res.status(403).json({ error: 'Document not found or not accessible' });
    }
  }

  let fileFields: {
    attachmentFileName: string;
    attachmentFilePath: string;
    attachmentFileSize: number;
    attachmentFileType: string;
  } | undefined;

  if (file) {
    if (!file.fileName || !file.data) {
      return res.status(400).json({ error: 'fileName and data are required for file upload' });
    }
    try {
      const saved = saveBase64Upload(file.fileName, file.data, file.fileType, 'messages');
      fileFields = {
        attachmentFileName: saved.fileName,
        attachmentFilePath: saved.filePath,
        attachmentFileSize: saved.fileSize,
        attachmentFileType: saved.fileType,
      };
    } catch (err) {
      if (err instanceof UploadTooLargeError) {
        return res.status(400).json({ error: err.message });
      }
      throw err;
    }
  }

  await ensureParticipant(conversationId, user.id);

  const message = await prisma.message.create({
    data: {
      conversationId,
      senderId: user.id,
      content: trimmed.slice(0, 4000),
      ...(documentId ? { documentId } : {}),
      ...(fileFields ?? {}),
    },
    include: messageInclude,
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  await prisma.conversationParticipant.update({
    where: { conversationId_userId: { conversationId, userId: user.id } },
    data: { lastReadAt: new Date() },
  });

  res.status(201).json(formatMessage(message));
}));

router.get('/:id/messages/:messageId/attachment', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const conversationId = String(req.params.id);
  const messageId = String(req.params.messageId);

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: { conversation: true },
  });

  if (!message || message.conversationId !== conversationId) {
    return res.status(404).json({ error: 'Attachment not found' });
  }
  if (!message.attachmentFilePath || !message.attachmentFileName) {
    return res.status(404).json({ error: 'No file attachment' });
  }

  if (!(await canAccessConversation(user, message.conversation))) {
    return res.status(404).json({ error: 'Attachment not found' });
  }

  await ensureParticipant(conversationId, user.id);

  const absolutePath = resolveUploadPath(message.attachmentFilePath);
  if (!fs.existsSync(absolutePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.download(absolutePath, message.attachmentFileName);
}));

router.post('/:id/read', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const conversationId = String(req.params.id);

  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation || !(await canAccessConversation(user, conversation))) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  await ensureParticipant(conversationId, user.id);

  await prisma.conversationParticipant.update({
    where: { conversationId_userId: { conversationId, userId: user.id } },
    data: { lastReadAt: new Date() },
  });

  res.json({ ok: true });
}));

export default router;
