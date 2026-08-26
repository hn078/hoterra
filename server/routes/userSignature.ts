import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { routeParam } from '../utils';
import {
  deleteTenantUpload,
  InvalidUploadError,
  saveBase64ImageUpload,
  UploadTooLargeError,
} from '../lib/uploads';
import { updateUserSignature, UserSignatureError } from '../modules/identity';

const router = Router();

router.post('/:id/signature', authMiddleware, async (req: Request, res: Response) => {
  try {
    res.json(await updateUserSignature(
      prisma,
      req.user!,
      routeParam(req.params.id),
      req.body,
      {
        save: (fileName, data) => saveBase64ImageUpload(fileName, data, 'signatures'),
        remove: (filePath) => deleteTenantUpload(filePath, 'signatures'),
      },
    ));
  } catch (error) {
    if (error instanceof UploadTooLargeError || error instanceof InvalidUploadError) {
      return res.status(400).json({ error: error.message });
    }
    if (!(error instanceof UserSignatureError)) throw error;
    if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'User not found' });
    if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Forbidden' });
    if (error.code === 'INVALID_FORMAT') return res.status(400).json({ error: 'Supported formats: PNG, JPG, WEBP' });
    return res.status(400).json({ error: 'fileName and data required' });
  }
});

export default router;
