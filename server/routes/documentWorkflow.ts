import { Router, Request, Response } from 'express';
import { Role } from '@prisma/client';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { routeParam } from '../utils';
import {
  decideDocumentApproval,
  DocumentApprovalError,
  getDocumentDetail,
  signDocument,
  DocumentSigningError,
} from '../modules/documents';
import { requireCapability } from '../modules/access-control';
import { hashTenantPrivateFile } from '../lib/privateFiles';

const router = Router();

function roleLabel(role: Role): string {
  const labels: Record<Role, string> = {
    EMPLOYEE: 'Employee',
    SUPERVISOR: 'Supervisor',
    HOD: 'Head of Department',
    FINANCE_DIRECTOR: 'Finance Director',
    GENERAL_MANAGER: 'General Manager',
    SYSTEM_ADMINISTRATOR: 'Administrator',
  };
  return labels[role];
}

router.post('/:id/sign', authMiddleware, requireCapability('documents.read', 'documents.sign'), async (req: Request, res: Response) => {
  const id = routeParam(req.params.id);
  try {
    const signature = await signDocument(prisma, req.user!, id, {
      pin: req.body.pin,
      ipAddress: req.ip,
      device: String(req.headers['user-agent'] ?? 'Web'),
      hashStoredFile: hashTenantPrivateFile,
    });

    // Signing records evidence only. The explicit approve action advances the
    // workflow after it verifies that this signature exists.
    res.json(signature);
  } catch (error) {
    if (!(error instanceof DocumentSigningError)) throw error;
    const code = error.code;
    if (code === 'PIN_REQUIRED') return res.status(400).json({ error: 'PIN required' });
    if (code === 'PIN_NOT_CONFIGURED') return res.status(400).json({ error: 'PIN not configured' });
    if (code === 'INVALID_PIN') return res.status(401).json({ error: 'Invalid PIN' });
    if (code === 'SIGNATURE_IMAGE_REQUIRED') {
      return res.status(400).json({ error: 'Upload your signature image in your profile before signing' });
    }
    if (code === 'ALREADY_SIGNED') return res.status(409).json({ error: 'This step is already signed' });
    if (code === 'CONFLICT') return res.status(409).json({ error: 'This approval step was already completed' });
    if (code === 'CONTENT_UNAVAILABLE') return res.status(409).json({ error: 'The document source is unavailable and cannot be signed' });
    if (code === 'FORBIDDEN') {
      return res.status(403).json({
        error: error.expectedRole
          ? `This document requires signature from ${roleLabel(error.expectedRole)}`
          : 'Document is not awaiting a signature',
      });
    }
    if (code === 'NOT_FOUND') return res.status(404).json({ error: 'Document not found' });
  }
});

router.post('/:id/approve', authMiddleware, requireCapability('documents.read', 'documents.approve'), async (req: Request, res: Response) => {
  const id = routeParam(req.params.id);
  const { action, comment } = req.body as {
    action: 'approve' | 'reject' | 'request_changes';
    comment?: string;
  };

  try {
    await decideDocumentApproval(prisma, req.user!, id, { action, comment });
    res.json(await getDocumentDetail(prisma, req.user!, id));
  } catch (error) {
    if (!(error instanceof DocumentApprovalError)) throw error;
    const code = error.code;
    if (code === 'CONFLICT') return res.status(409).json({ error: 'This approval step was already completed' });
    if (code === 'SIGNATURE_REQUIRED') {
      return res.status(409).json({ error: 'Sign this approval step before approving it' });
    }
    if (code === 'FORBIDDEN') {
      return res.status(403).json({
        error: error.expectedRole
          ? `This document requires action from ${roleLabel(error.expectedRole)}`
          : 'You are not authorized to act on this document at the current step',
      });
    }
    if (code === 'INVALID_STATE') return res.status(400).json({ error: 'Document is not awaiting approval at this step' });
    if (code === 'INVALID_ACTION') return res.status(400).json({ error: 'Invalid approval action' });
    if (code === 'NOT_FOUND') return res.status(404).json({ error: 'Document not found' });
  }
});

export default router;
