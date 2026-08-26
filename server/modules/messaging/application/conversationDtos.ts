import { ConversationType, Prisma } from '@prisma/client';
import type { AuthUser } from '../../../middleware/auth';
import { canReadDocument } from '../../documents';

export const conversationReadInclude = {
  department: { select: { id: true, name: true, color: true, code: true } },
  participants: {
    include: { user: { select: { id: true, firstName: true, lastName: true } } },
  },
  messages: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    include: {
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
    },
  },
} satisfies Prisma.ConversationInclude;

type ConversationReadRecord = Prisma.ConversationGetPayload<{ include: typeof conversationReadInclude }>;

function previewContent(message: ConversationReadRecord['messages'][number], actor: AuthUser): string {
  if (message.content.trim()) return message.content;
  if (message.document) {
    return canReadDocument(actor, message.document) ? `📎 ${message.document.title}` : '📎 Document';
  }
  if (message.attachmentFileName) return `📎 ${message.attachmentFileName}`;
  return '';
}

export function toConversationDto(conversation: ConversationReadRecord, actor: AuthUser, unreadCount: number) {
  const lastMessage = conversation.messages[0];
  let name = 'Conversation';
  let otherUser: { id: string; firstName: string; lastName: string } | undefined;
  if (conversation.type === ConversationType.HOTEL) name = 'Hotel-wide Chat';
  else if (conversation.type === ConversationType.DEPARTMENT) {
    name = conversation.department ? `${conversation.department.name} Chat` : 'Department Chat';
  } else {
    const other = conversation.participants.find((participant) => participant.userId !== actor.id)?.user;
    if (other) {
      otherUser = { id: other.id, firstName: other.firstName, lastName: other.lastName };
      name = `${other.firstName} ${other.lastName}`;
    }
  }
  return {
    id: conversation.id,
    type: conversation.type,
    name,
    departmentId: conversation.departmentId,
    department: conversation.department,
    otherUser,
    lastMessage: lastMessage
      ? {
          content: previewContent(lastMessage, actor),
          createdAt: lastMessage.createdAt.toISOString(),
          senderName: `${lastMessage.sender.firstName} ${lastMessage.sender.lastName}`,
        }
      : null,
    unreadCount,
    updatedAt: conversation.updatedAt.toISOString(),
  };
}
