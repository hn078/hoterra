import nodemailer from 'nodemailer';
import { prisma, systemPrisma } from '../db';
import { isProduction, runtimeConfig } from '../config';
import { requireTenantContext, runWithTenant } from './tenantContext';

const MAX_ATTEMPTS = 5;
const FRONTEND_URL = runtimeConfig.frontendUrl;
let worker: ReturnType<typeof setInterval> | null = null;
let transport: ReturnType<typeof nodemailer.createTransport> | null = null;

export function appUrl(path: string): string {
  const base = isProduction
    ? `https://${requireTenantContext().slug}.${runtimeConfig.tenantBaseDomain}`
    : FRONTEND_URL.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

function mailTransport() {
  if (!runtimeConfig.emailDeliveryEnabled) return null;
  if (transport) return transport;
  if (!process.env.SMTP_HOST) {
    if (isProduction) throw new Error('SMTP is not configured');
    return null;
  }
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
    requireTLS: process.env.SMTP_SECURE !== 'true',
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transport;
}

async function deliverEmail(id: string) {
  const claimed = await prisma.emailOutbox.updateMany({
    where: {
      id,
      status: { in: ['QUEUED', 'FAILED'] },
      attempts: { lt: MAX_ATTEMPTS },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
    },
    data: { status: 'SENDING', attempts: { increment: 1 }, lastError: null },
  });
  if (claimed.count !== 1) return;

  const row = await prisma.emailOutbox.findUnique({ where: { id } });
  if (!row) return;
  const smtp = mailTransport();
  if (!smtp) {
    await prisma.emailOutbox.update({
      where: { id },
      data: { status: 'FAILED', lastError: 'SMTP is not configured', nextAttemptAt: new Date(Date.now() + 60_000) },
    });
    return;
  }

  try {
    await smtp.sendMail({
      from: process.env.SMTP_FROM || 'HOTERRA <noreply@localhost>',
      to: row.toEmail,
      subject: row.subject,
      text: row.body,
    });
    await prisma.emailOutbox.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date(), lastError: null, nextAttemptAt: null },
    });
    console.log(JSON.stringify({ level: 'info', event: 'email_sent', outboxId: id }));
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'Unknown SMTP error';
    const retryMinutes = Math.min(60, 2 ** Math.max(1, row.attempts));
    await prisma.emailOutbox.update({
      where: { id },
      data: {
        status: 'FAILED',
        lastError: message,
        nextAttemptAt: new Date(Date.now() + retryMinutes * 60_000),
      },
    });
    console.error(JSON.stringify({ level: 'error', event: 'email_failed', outboxId: id, error: message }));
  }
}

async function deliverDueEmailsForTenant() {
  const rows = await prisma.emailOutbox.findMany({
    where: {
      status: { in: ['QUEUED', 'FAILED'] },
      attempts: { lt: MAX_ATTEMPTS },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
    },
    orderBy: { createdAt: 'asc' },
    take: 25,
    select: { id: true },
  });
  for (const row of rows) await deliverEmail(row.id);
}

async function deliverDueEmails() {
  const tenants = await systemPrisma.tenant.findMany({ where: { isActive: true } });
  for (const tenant of tenants) {
    await runWithTenant(tenant, deliverDueEmailsForTenant);
  }
}

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
      toEmail: input.toEmail.trim().toLowerCase(),
      subject: input.subject.slice(0, 300),
      body: input.body,
      entityType: input.entityType,
      entityId: input.entityId,
      status: runtimeConfig.emailDeliveryEnabled ? 'QUEUED' : 'DISABLED',
    },
  });
  if (runtimeConfig.emailDeliveryEnabled) {
    void deliverEmail(row.id).catch((error) => console.error('[mail-delivery]', error));
  }
  return row;
}

export function startEmailOutboxWorker() {
  if (worker || !runtimeConfig.emailDeliveryEnabled) return;
  void deliverDueEmails().catch((error) => console.error('[mail-worker]', error));
  worker = setInterval(() => {
    void deliverDueEmails().catch((error) => console.error('[mail-worker]', error));
  }, 30_000);
  worker.unref();
}

export function stopEmailOutboxWorker() {
  if (worker) clearInterval(worker);
  worker = null;
  transport?.close();
  transport = null;
}
