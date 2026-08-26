import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import {
  ConversationMessageError,
  getConversationAttachment,
  listConversationMessages,
  markConversationRead,
  sendConversationMessage,
} from '../modules/messaging';
import {
  deleteTenantUpload,
  InvalidUploadError,
  saveBase64Upload,
  UploadTooLargeError,
} from '../lib/uploads';
import { sendTenantPrivateFile } from '../lib/privateFiles';

const router = Router();

router.get('/:id/messages', asyncHandler(async (req: Request, res: Response) => {
  const conversationId = String(req.params.id);
  try {
    res.json(await listConversationMessages(prisma, req.user!, conversationId, req.query));
  } catch (error) {
    if (!(error instanceof ConversationMessageError)) throw error;
    if (error.code === 'INVALID_INPUT') return res.status(400).json({ error: 'Invalid message query' });
    return res.status(error.code === 'FORBIDDEN' ? 403 : 404).json({ error: 'Conversation not found' });
  }
}));

router.post('/:id/messages', asyncHandler(async (req: Request, res: Response) => {
  const conversationId = String(req.params.id);
  try {
    const message = await sendConversationMessage(prisma, req.user!, conversationId, req.body, {
      save: (fileName, data, fileType) => saveBase64Upload(fileName, data, fileType, 'messages'),
      remove: (filePath) => deleteTenantUpload(filePath, 'messages'),
    });
    res.status(201).json(message);
  } catch (error) {
    if (error instanceof UploadTooLargeError || error instanceof InvalidUploadError) {
      return res.status(400).json({ error: error.message });
    }
    if (!(error instanceof ConversationMessageError)) throw error;
    if (error.code === 'DOCUMENT_FORBIDDEN') return res.status(403).json({ error: 'Document not found or not accessible' });
    if (error.code === 'INVALID_INPUT') return res.status(400).json({ error: 'Message content or one attachment is required' });
    if (error.code === 'RECIPIENT_UNAVAILABLE') {
      return res.status(409).json({ error: 'This recipient is no longer available for messages' });
    }
    return res.status(error.code === 'FORBIDDEN' ? 403 : 404).json({ error: 'Conversation not found' });
  }
}));

router.get('/:id/messages/:messageId/attachment', asyncHandler(async (req: Request, res: Response) => {
  const conversationId = String(req.params.id);
  const messageId = String(req.params.messageId);
  try {
    const attachment = await getConversationAttachment(prisma, req.user!, conversationId, messageId);
    return sendTenantPrivateFile(res, attachment.filePath, attachment.fileName);
  } catch (error) {
    if (!(error instanceof ConversationMessageError)) throw error;
    return res.status(error.code === 'FORBIDDEN' ? 403 : 404).json({ error: 'Attachment not found' });
  }
}));

router.post('/:id/read', asyncHandler(async (req: Request, res: Response) => {
  const conversationId = String(req.params.id);
  try {
    res.json(await markConversationRead(prisma, req.user!, conversationId));
  } catch (error) {
    if (!(error instanceof ConversationMessageError)) throw error;
    return res.status(error.code === 'FORBIDDEN' ? 403 : 404).json({ error: 'Conversation not found' });
  }
}));

export default router;
