import { Conversation, ConversationType, Prisma } from '@prisma/client';
import { prisma } from '../db';
import { AuthUser } from '../middleware/auth';

export function directKeyFor(userIdA: string, userIdB: string): string {
  return [userIdA, userIdB].sort().join(':');
}

export async function ensureHotelConversation(): Promise<Conversation> {
  const existing = await prisma.conversation.findFirst({
    where: { type: ConversationType.HOTEL },
  });
  if (existing) return existing;

  return prisma.conversation.create({
    data: { type: ConversationType.HOTEL },
  });
}

export async function ensureDepartmentConversation(departmentId: string): Promise<Conversation> {
  const existing = await prisma.conversation.findFirst({
    where: { type: ConversationType.DEPARTMENT, departmentId },
  });
  if (existing) return existing;

  return prisma.conversation.create({
    data: { type: ConversationType.DEPARTMENT, departmentId },
  });
}

export async function ensureParticipant(conversationId: string, userId: string) {
  return prisma.conversationParticipant.upsert({
    where: {
      conversationId_userId: { conversationId, userId },
    },
    create: { conversationId, userId },
    update: {},
  });
}

export async function findOrCreateDirectConversation(
  userIdA: string,
  userIdB: string
): Promise<Conversation> {
  const directKey = directKeyFor(userIdA, userIdB);
  const existing = await prisma.conversation.findUnique({ where: { directKey } });
  if (existing) return existing;

  return prisma.conversation.create({
    data: {
      type: ConversationType.DIRECT,
      directKey,
      participants: {
        create: [{ userId: userIdA }, { userId: userIdB }],
      },
    },
  });
}

export async function canAccessConversation(
  user: AuthUser,
  conversation: Conversation
): Promise<boolean> {
  if (conversation.type === ConversationType.HOTEL) return true;

  if (conversation.type === ConversationType.DEPARTMENT) {
    return !!user.departmentId && user.departmentId === conversation.departmentId;
  }

  if (conversation.type === ConversationType.DIRECT) {
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: conversation.id,
          userId: user.id,
        },
      },
    });
    return !!participant;
  }

  return false;
}

const conversationInclude = {
  department: { select: { id: true, name: true, color: true, code: true } },
  participants: {
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
    },
  },
  messages: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    include: {
      sender: { select: { id: true, firstName: true, lastName: true } },
      document: { select: { id: true, title: true, code: true, status: true } },
    },
  },
} satisfies Prisma.ConversationInclude;

export const messageInclude = {
  sender: { select: { id: true, firstName: true, lastName: true } },
  document: { select: { id: true, title: true, code: true, status: true } },
} satisfies Prisma.MessageInclude;

type MessagePayload = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

export function formatMessage(message: MessagePayload) {
  const fileAttachment =
    message.attachmentFileName && message.attachmentFilePath
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
    document: message.document
      ? {
          id: message.document.id,
          title: message.document.title,
          code: message.document.code,
          status: message.document.status,
        }
      : null,
    fileAttachment,
    createdAt: message.createdAt.toISOString(),
  };
}

function previewContent(message: MessagePayload): string {
  if (message.content.trim()) return message.content;
  if (message.document) return `📎 ${message.document.title}`;
  if (message.attachmentFileName) return `📎 ${message.attachmentFileName}`;
  return '';
}

export async function ensureUserConversations(user: AuthUser) {
  const hotelConv = await ensureHotelConversation();
  await ensureParticipant(hotelConv.id, user.id);

  if (user.departmentId) {
    const deptConv = await ensureDepartmentConversation(user.departmentId);
    await ensureParticipant(deptConv.id, user.id);
  }
}

export async function getUnreadCount(
  conversationId: string,
  userId: string,
  lastReadAt: Date | null
): Promise<number> {
  return prisma.message.count({
    where: {
      conversationId,
      senderId: { not: userId },
      ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
    },
  });
}

export function formatConversation(
  conversation: Prisma.ConversationGetPayload<{ include: typeof conversationInclude }>,
  currentUserId: string,
  unreadCount: number
) {
  const lastMessage = conversation.messages[0];
  let name = 'Conversation';
  let otherUser: { id: string; firstName: string; lastName: string } | undefined;

  if (conversation.type === ConversationType.HOTEL) {
    name = 'Hotel-wide Chat';
  } else if (conversation.type === ConversationType.DEPARTMENT) {
    name = conversation.department ? `${conversation.department.name} Chat` : 'Department Chat';
  } else {
    const other = conversation.participants.find((p) => p.userId !== currentUserId)?.user;
    if (other) {
      otherUser = {
        id: other.id,
        firstName: other.firstName,
        lastName: other.lastName,
      };
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
          content: previewContent(lastMessage),
          createdAt: lastMessage.createdAt.toISOString(),
          senderName: `${lastMessage.sender.firstName} ${lastMessage.sender.lastName}`,
        }
      : null,
    unreadCount,
    updatedAt: conversation.updatedAt.toISOString(),
  };
}

export { conversationInclude };
