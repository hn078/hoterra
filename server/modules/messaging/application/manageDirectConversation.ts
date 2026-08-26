import { AuditAction, ConversationType } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { resolveEffectiveCapabilities } from '../../access-control';
import { MessagingAccessError } from './bootstrapUserConversations';
import { conversationReadInclude, toConversationDto } from './conversationDtos';

type MessagingDatabase = typeof DatabaseModule.prisma;

export class DirectConversationError extends Error {
  constructor(public readonly code: 'FORBIDDEN' | 'INVALID_USER' | 'USER_NOT_FOUND') {
    super(code);
    this.name = 'DirectConversationError';
  }
}

function directKey(firstUserId: string, secondUserId: string) {
  return [firstUserId, secondUserId].sort().join(':');
}

export async function startDirectConversation(database: MessagingDatabase, actor: AuthUser, targetUserIdValue: unknown) {
  if (!actor.capabilities.includes('messages.use')) throw new MessagingAccessError('FORBIDDEN');
  const targetUserId = String(targetUserIdValue ?? '').trim();
  if (!targetUserId || targetUserId === actor.id) throw new DirectConversationError('INVALID_USER');
  const key = directKey(actor.id, targetUserId);

  const conversationId = await database.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`messaging:direct:${key}`}))`;
    const target = await transaction.user.findFirst({
      where: { id: targetUserId, isActive: true },
      select: {
        id: true,
        role: true,
        customRole: { select: { permissions: true, isActive: true } },
      },
    });
    if (!target || !resolveEffectiveCapabilities(target.role, target.customRole).includes('messages.use')) {
      throw new DirectConversationError('USER_NOT_FOUND');
    }
    let conversation = await transaction.conversation.findFirst({ where: { directKey: key } });
    const created = !conversation;
    if (!conversation) {
      conversation = await transaction.conversation.create({
        data: { type: ConversationType.DIRECT, directKey: key },
      });
    }
    await Promise.all([actor.id, targetUserId].map((userId) => transaction.conversationParticipant.upsert({
      where: { conversationId_userId: { conversationId: conversation!.id, userId } },
      create: { conversationId: conversation!.id, userId },
      update: {},
    })));
    if (created) {
      await transaction.auditLog.create({
        data: {
          userId: actor.id,
          userName: `${actor.firstName} ${actor.lastName}`,
          action: AuditAction.CREATE,
          entityType: 'Conversation',
          entityId: conversation.id,
          details: `Started direct conversation with user ${targetUserId}`,
        },
      });
    }
    return conversation.id;
  });

  const [conversation, participant] = await Promise.all([
    database.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: conversationReadInclude }),
    database.conversationParticipant.findUniqueOrThrow({
      where: { conversationId_userId: { conversationId, userId: actor.id } },
      select: { lastReadAt: true },
    }),
  ]);
  const unread = await database.message.count({
    where: {
      conversationId,
      senderId: { not: actor.id },
      ...(participant.lastReadAt ? { createdAt: { gt: participant.lastReadAt } } : {}),
    },
  });
  return toConversationDto(conversation, actor, unread);
}
