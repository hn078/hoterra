import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Response } from 'express';
import { InvalidUploadError, resolveTenantUploadPath } from './uploads';

export function sendTenantPrivateFile(
  res: Response,
  storedPath: string,
  downloadName?: string | null,
  inline = false,
) {
  let absolutePath: string;
  try {
    absolutePath = resolveTenantUploadPath(storedPath);
  } catch (error) {
    if (error instanceof InvalidUploadError) {
      return res.status(404).json({ error: 'File not found' });
    }
    throw error;
  }
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (inline) {
    res.type(path.extname(absolutePath));
    res.setHeader('Content-Disposition', 'inline');
    return res.sendFile(absolutePath);
  }
  return res.download(absolutePath, downloadName || path.basename(absolutePath));
}

/** Hashes an already tenant-validated private upload without exposing its path. */
export async function hashTenantPrivateFile(storedPath: string): Promise<string> {
  const absolutePath = resolveTenantUploadPath(storedPath);
  const stat = await fs.promises.stat(absolutePath);
  if (!stat.isFile()) throw new InvalidUploadError('File not found');

  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = fs.createReadStream(absolutePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}
