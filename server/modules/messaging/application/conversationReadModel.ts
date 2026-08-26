import { ConversationType } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';
import { resolveEffectiveCapabilities } from '../../access-control';
import { MessagingAccessError } from './bootstrapUserConversations';
import { conversationReadInclude, toConversationDto } from './conversationDtos';

type MessagingDatabase = typeof DatabaseModule.prisma;

function assertCapability(actor: AuthUser) {
  if (!actor.capabilities.includes('messages.use')) throw new MessagingAccessError('FORBIDDEN');
}

async function visibleConversationIds(database: MessagingDatabase, actor: AuthUser) {
  const shared = await database.conversation.findMany({
    where: {
      OR: [
        { type: ConversationType.HOTEL },
        ...(actor.departmentId
          ? [{ type: ConversationType.DEPARTMENT, departmentId: actor.departmentId }]
          : []),
      ],
    },
    select: { id: true },
  });
  const direct = await database.conversationParticipant.findMany({
    where: { userId: actor.id, conversation: { type: ConversationType.DIRECT } },
    select: { conversationId: true },
    orderBy: { joinedAt: 'desc' },
    take: 200,
  });
  return [...new Set([...shared.map((row) => row.id), ...direct.map((row) => row.conversationId)])];
}

async function unreadCount(database: MessagingDatabase, conversationId: string, actorId: string, readFrom: Date) {
  return database.message.count({
    where: {
      conversationId,
      senderId: { not: actorId },
      createdAt: { gt: readFrom },
    },
  });
}

export async function listConversations(database: MessagingDatabase, actor: AuthUser) {
  assertCapability(actor);
  const ids = await visibleConversationIds(database, actor);
  if (!ids.length) return [];
  const [rows, participantRows] = await Promise.all([
    database.conversation.findMany({
      where: { id: { in: ids } },
      include: conversationReadInclude,
    }),
    database.conversationParticipant.findMany({
      where: { userId: actor.id, conversationId: { in: ids } },
      select: { conversationId: true, lastReadAt: true, joinedAt: true },
    }),
  ]);
  const participantMap = new Map(participantRows.map((row) => [row.conversationId, row]));
  const conversations = await Promise.all(rows.map(async (row) => toConversationDto(
    row,
    actor,
    participantMap.has(row.id)
      ? await unreadCount(
          database,
          row.id,
          actor.id,
          participantMap.get(row.id)!.lastReadAt ?? participantMap.get(row.id)!.joinedAt,
        )
      : 0,
  )));
  const order = { HOTEL: 0, DEPARTMENT: 1, DIRECT: 2 } as const;
  return conversations.sort((a, b) => {
    const typeDifference = order[a.type] - order[b.type];
    return typeDifference || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export async function getConversationsUnreadCount(database: MessagingDatabase, actor: AuthUser) {
  assertCapability(actor);
  const ids = await visibleConversationIds(database, actor);
  if (!ids.length) return { count: 0 };
  const participants = await database.conversationParticipant.findMany({
    where: { userId: actor.id, conversationId: { in: ids } },
    select: { conversationId: true, lastReadAt: true, joinedAt: true },
  });
  const participantMap = new Map(participants.map((row) => [row.conversationId, row]));
  const counts = await Promise.all(ids.map((id) => {
    const participant = participantMap.get(id);
    return participant
      ? unreadCount(database, id, actor.id, participant.lastReadAt ?? participant.joinedAt)
      : 0;
  }));
  return { count: counts.reduce((total, count) => total + count, 0) };
}

export async function listMessageContacts(database: MessagingDatabase, actor: AuthUser) {
  assertCapability(actor);
  const users = await database.user.findMany({
    where: { id: { not: actor.id }, isActive: true },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true,
      department: { select: { id: true, name: true } },
      customRole: { select: { permissions: true, isActive: true } },
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    take: 500,
  });

  return users
    .filter((user) => resolveEffectiveCapabilities(user.role, user.customRole).includes('messages.use'))
    .map(({ customRole: _customRole, role: _role, ...user }) => user);
}
