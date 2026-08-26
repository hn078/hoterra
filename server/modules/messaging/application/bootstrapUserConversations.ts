import { ConversationType } from '@prisma/client';
import type * as DatabaseModule from '../../../db';
import type { AuthUser } from '../../../middleware/auth';

type MessagingDatabase = typeof DatabaseModule.prisma;

export class MessagingAccessError extends Error {
  constructor(public readonly code: 'FORBIDDEN') {
    super(code);
    this.name = 'MessagingAccessError';
  }
}

export async function bootstrapUserConversations(database: MessagingDatabase, actor: AuthUser) {
  if (!actor.capabilities.includes('messages.use')) throw new MessagingAccessError('FORBIDDEN');
  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`messaging:bootstrap:${actor.tenantId}`}))`;
    let hotel = await transaction.conversation.findFirst({ where: { type: ConversationType.HOTEL } });
    if (!hotel) hotel = await transaction.conversation.create({ data: { type: ConversationType.HOTEL } });
    await transaction.conversationParticipant.upsert({
      where: { conversationId_userId: { conversationId: hotel.id, userId: actor.id } },
      create: { conversationId: hotel.id, userId: actor.id },
      update: {},
    });

    let departmentId: string | null = null;
    if (actor.departmentId) {
      let department = await transaction.conversation.findFirst({
        where: { type: ConversationType.DEPARTMENT, departmentId: actor.departmentId },
      });
      if (!department) {
        department = await transaction.conversation.create({
          data: { type: ConversationType.DEPARTMENT, departmentId: actor.departmentId },
        });
      }
      departmentId = department.id;
      await transaction.conversationParticipant.upsert({
        where: { conversationId_userId: { conversationId: department.id, userId: actor.id } },
        create: { conversationId: department.id, userId: actor.id },
        update: {},
      });
    }
    return { hotelConversationId: hotel.id, departmentConversationId: departmentId };
  });
}
