import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { authMiddleware } from '../middleware/auth';
import { requireCapability } from '../modules/access-control';
import { globalSearch, GlobalSearchError } from '../modules/search';

const router = Router();

router.get('/', authMiddleware, requireCapability('search.use'), asyncHandler(async (req: Request, res: Response) => {
  try {
    res.json(await globalSearch(prisma, req.user!, {
      q: req.query.q,
      type: req.query.type,
      module: req.query.module,
      searchIn: req.query.searchIn,
      fileType: req.query.fileType,
      dateRange: req.query.dateRange,
      createdBy: req.query.createdBy,
      departmentId: req.query.departmentId,
      category: req.query.category,
      status: req.query.status,
      includeArchived: req.query.includeArchived,
      sort: req.query.sort,
    }));
  } catch (error) {
    if (!(error instanceof GlobalSearchError)) throw error;
    return error.code === 'FORBIDDEN'
      ? res.status(403).json({ error: 'Forbidden' })
      : res.status(400).json({ error: error.detail || 'Invalid search filters' });
  }
}));

export default router;
