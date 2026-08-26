import { AuditAction, ConversationType, Prisma } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { resolveEffectiveCapabilities } from '../../access-control';
import { canReadDocument } from '../../documents';

type MessagingDatabase = typeof DatabaseModule.prisma;

export type ConversationMessageErrorCode =
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INVALID_INPUT'
  | 'RECIPIENT_UNAVAILABLE'
  | 'DOCUMENT_FORBIDDEN'
  | 'ATTACHMENT_NOT_FOUND';

export class ConversationMessageError extends Error {
  constructor(public readonly code: ConversationMessageErrorCode) {
    super(code);
    this.name = 'ConversationMessageError';
  }
}

export interface MessageStorage {
  save(fileName: string, data: string, fileType?: string): {
    fileName: string;
    filePath: string;
    fileSize: number;
    fileType: string;
  };
  remove(filePath: string): void;
}

const safeMessageInclude = {
  sender: { select: { id: true, firstName: true, lastName: true } },
  document: {
    select: {
      id: true,
      tenantId: true,
      title: true,
      code: true,
      status: true,
      departmentId: true,
      authorId: true,
      ownerId: true,
    },
  },
} satisfies Prisma.MessageInclude;

type SafeMessage = Prisma.MessageGetPayload<{ include: typeof safeMessageInclude }>;
type ConversationRef = { id: string; type: ConversationType; departmentId: string | null };

async function canAccess(database: any, actor: AuthUser, conversation: ConversationRef) {
  if (conversation.type === ConversationType.HOTEL) return true;
  if (conversation.type === ConversationType.DEPARTMENT) {
    return Boolean(actor.departmentId && actor.departmentId === conversation.departmentId);
  }
  if (conversation.type === ConversationType.DIRECT) {
    return Boolean(await database.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: conversation.id, userId: actor.id } },
      select: { id: true },
    }));
  }
  return false;
}

function assertCapability(actor: AuthUser) {
  if (!actor.capabilities.includes('messages.use')) throw new ConversationMessageError('FORBIDDEN');
}

function formatMessageForActor(message: SafeMessage, actor: AuthUser) {
  const visibleDocument = message.document && canReadDocument(actor, message.document)
    ? {
        id: message.document.id,
        title: message.document.title,
        code: message.document.code,
        status: message.document.status,
      }
    : null;
  const fileAttachment = message.attachmentFileName && message.attachmentFilePath
    ? {
        fileName: message.attachmentFileName,
        fileSize: message.attachmentFileSize ?? 0,
        fileType: message.attachmentFileType ?? null,
        downloadUrl: `/conversations/${message.conversationId}/messages/${message.id}/attachment`,
      }
    : null;
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    sender: message.sender,
    content: message.content,
    document: visibleDocument,
    fileAttachment,
    createdAt: message.createdAt.toISOString(),
  };
}

async function accessibleConversation(database: any, actor: AuthUser, conversationId: string) {
  const conversation = await database.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, type: true, departmentId: true },
  }) as ConversationRef | null;
  if (!conversation || !(await canAccess(database, actor, conversation))) {
    throw new ConversationMessageError('NOT_FOUND');
  }
  return conversation;
}

async function assertDirectRecipientAvailable(database: any, actor: AuthUser, conversation: ConversationRef) {
  if (conversation.type !== ConversationType.DIRECT) return;
  const recipients = await database.conversationParticipant.findMany({
    where: { conversationId: conversation.id, userId: { not: actor.id } },
    select: {
      user: {
        select: {
          isActive: true,
          role: true,
          customRole: { select: { permissions: true, isActive: true } },
        },
      },
    },
    take: 2,
  });
  const recipient = recipients.length === 1 ? recipients[0].user : null;
  if (!recipient
    || !recipient.isActive
    || !resolveEffectiveCapabilities(recipient.role, recipient.customRole).includes('messages.use')) {
    throw new ConversationMessageError('RECIPIENT_UNAVAILABLE');
  }
}

export async function listConversationMessages(
  database: MessagingDatabase,
  actor: AuthUser,
  conversationId: string,
  query: { limit?: unknown; before?: unknown },
) {
  assertCapability(actor);
  await accessibleConversation(database, actor, conversationId);
  const requestedLimit = Number(query.limit ?? 50);
  const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, Math.trunc(requestedLimit))) : 50;
  const before = query.before ? new Date(String(query.before)) : undefined;
  if (before && Number.isNaN(before.getTime())) throw new ConversationMessageError('INVALID_INPUT');
  const messages = await database.message.findMany({
    where: { conversationId, ...(before ? { createdAt: { lt: before } } : {}) },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: safeMessageInclude,
  });
  return { data: messages.reverse().map((message) => formatMessageForActor(message, actor)), hasMore: messages.length === limit };
}

export async function sendConversationMessage(
  database: MessagingDatabase,
  actor: AuthUser,
  conversationId: string,
  input: {
    content?: unknown;
    documentId?: unknown;
    file?: { fileName?: unknown; fileType?: unknown; data?: unknown };
  },
  storage: MessageStorage,
) {
  assertCapability(actor);
  const content = String(input.content ?? '').trim();
  const documentId = String(input.documentId ?? '').trim() || null;
  const file = input.file;
  if (!content && !documentId && !file) throw new ConversationMessageError('INVALID_INPUT');
  if (documentId && file) throw new ConversationMessageError('INVALID_INPUT');
  const conversation = await accessibleConversation(database, actor, conversationId);
  await assertDirectRecipientAvailable(database, actor, conversation);
  if (documentId) {
    const document = await database.document.findUnique({ where: { id: documentId } });
    if (!document || !canReadDocument(actor, document)) throw new ConversationMessageError('DOCUMENT_FORBIDDEN');
  }

  let saved: ReturnType<MessageStorage['save']> | null = null;
  if (file) {
    const fileName = String(file.fileName ?? '').trim();
    const data = String(file.data ?? '');
    if (!fileName || !data) throw new ConversationMessageError('INVALID_INPUT');
    saved = storage.save(fileName, data, file.fileType ? String(file.fileType) : undefined);
  }

  try {
    const message = await database.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`messaging:conversation:${conversationId}`}))`;
      const currentConversation = await accessibleConversation(transaction, actor, conversationId);
      await assertDirectRecipientAvailable(transaction, actor, currentConversation);
      if (documentId) {
        const document = await transaction.document.findUnique({ where: { id: documentId } });
        if (!document || !canReadDocument(actor, document)) throw new ConversationMessageError('DOCUMENT_FORBIDDEN');
      }
      await transaction.conversationParticipant.upsert({
        where: { conversationId_userId: { conversationId, userId: actor.id } },
        create: { conversationId, userId: actor.id, lastReadAt: new Date() },
        update: { lastReadAt: new Date() },
      });
      const created = await transaction.message.create({
        data: {
          conversationId,
          senderId: actor.id,
          content: content.slice(0, 4000),
          ...(documentId ? { documentId } : {}),
          ...(saved ? {
            attachmentFileName: saved.fileName,
            attachmentFilePath: saved.filePath,
            attachmentFileSize: saved.fileSize,
            attachmentFileType: saved.fileType,
          } : {}),
        },
        include: safeMessageInclude,
      });
      await transaction.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
      await transaction.auditLog.create({
        data: {
          userId: actor.id,
          userName: `${actor.firstName} ${actor.lastName}`,
          action: AuditAction.CREATE,
          entityType: 'Message',
          entityId: created.id,
          details: `Sent message in conversation ${conversationId}${documentId ? ' with document reference' : saved ? ' with file attachment' : ''}`,
        },
      });
      return created;
    });
    return formatMessageForActor(message, actor);
  } catch (error) {
    if (saved) {
      try { storage.remove(saved.filePath); } catch { /* preserve original error */ }
    }
    throw error;
  }
}

export async function markConversationRead(database: MessagingDatabase, actor: AuthUser, conversationId: string) {
  assertCapability(actor);
  await database.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`messaging:conversation:${conversationId}`}))`;
    await accessibleConversation(transaction, actor, conversationId);
    await transaction.conversationParticipant.upsert({
      where: { conversationId_userId: { conversationId, userId: actor.id } },
      create: { conversationId, userId: actor.id, lastReadAt: new Date() },
      update: { lastReadAt: new Date() },
    });
  });
  return { ok: true };
}

export async function getConversationAttachment(
  database: MessagingDatabase,
  actor: AuthUser,
  conversationId: string,
  messageId: string,
) {
  assertCapability(actor);
  await accessibleConversation(database, actor, conversationId);
  const message = await database.message.findUnique({
    where: { id: messageId },
    select: { conversationId: true, attachmentFilePath: true, attachmentFileName: true },
  });
  if (!message || message.conversationId !== conversationId || !message.attachmentFilePath || !message.attachmentFileName) {
    throw new ConversationMessageError('ATTACHMENT_NOT_FOUND');
  }
  return { filePath: message.attachmentFilePath, fileName: message.attachmentFileName };
}
