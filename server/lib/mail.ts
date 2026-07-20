import { prisma } from '../db';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

export function appUrl(path: string): string {
  const base = FRONTEND_URL.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Persist + "send" email (dev outbox; logs to console). Ready for real SMTP later. */
export async function queueEmail(input: {
  toEmail: string;
  subject: string;
  body: string;
  entityType?: string;
  entityId?: string;
}) {
  if (!input.toEmail) return null;

  const row = await prisma.emailOutbox.create({
    data: {
      toEmail: input.toEmail,
      subject: input.subject,
      body: input.body,
      entityType: input.entityType,
      entityId: input.entityId,
      status: 'SENT',
      sentAt: new Date(),
    },
  });

  console.log(`[mail] → ${input.toEmail} | ${input.subject}`);
  return row;
}

export async function listOutbox(limit = 50) {
  return prisma.emailOutbox.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
