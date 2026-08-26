import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { routeParam } from '../utils';
import { requireCapability } from '../modules/access-control';
import { createUserAccount, getUserResponsibilitySummary, updateUserAccount, UserAccountError } from '../modules/identity';

const router = Router();

function accountErrorResponse(error: UserAccountError, res: Response) {
  if (error.code === 'FORBIDDEN') return res.status(403).json({ error: error.detail || 'Forbidden' });
  if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'User not found' });
  if (error.code === 'EMAIL_EXISTS') return res.status(400).json({ error: 'Email already exists' });
  if (error.code === 'CUSTOM_ROLE_NOT_FOUND') return res.status(400).json({ error: 'Custom role not found' });
  if (error.code === 'DEPARTMENT_NOT_FOUND') return res.status(400).json({ error: 'Department not found' });
  if (error.code === 'LAST_SYSTEM_ADMIN') return res.status(409).json({ error: 'The last active System Administrator cannot be deactivated or reassigned' });
  if (error.code === 'OUTSTANDING_RESPONSIBILITIES') return res.status(409).json({ error: error.detail });
  if (error.code === 'INVALID_EMAIL') return res.status(400).json({ error: 'A valid email is required' });
  if (error.code === 'INVALID_PASSWORD') return res.status(400).json({ error: error.detail || 'Password does not meet the tenant security policy' });
  if (error.code === 'INVALID_ROLE') return res.status(400).json({ error: 'Invalid role' });
  if (error.code === 'INVALID_NAME') return res.status(400).json({ error: 'First and last name are required' });
  if (error.code === 'INVALID_JOB_TITLE') return res.status(400).json({ error: 'Job title must be 120 characters or fewer' });
  if (error.code === 'SELF_MUTATION') return res.status(400).json({ error: error.detail });
  return res.status(400).json({ error: 'Missing or invalid fields' });
}

router.post('/', authMiddleware, requireCapability('users.create'), async (req: Request, res: Response) => {
  try {
    res.status(201).json(await createUserAccount(prisma, req.user!, req.body));
  } catch (error) {
    if (!(error instanceof UserAccountError)) throw error;
    return accountErrorResponse(error, res);
  }
});

router.get('/:id/responsibilities', authMiddleware, requireCapability('users.update'), async (req: Request, res: Response) => {
  try {
    res.json(await getUserResponsibilitySummary(prisma, req.user!, routeParam(req.params.id)));
  } catch (error) {
    if (!(error instanceof UserAccountError)) throw error;
    return accountErrorResponse(error, res);
  }
});

router.patch('/:id', authMiddleware, requireCapability('users.update'), async (req: Request, res: Response) => {
  try {
    res.json(await updateUserAccount(prisma, req.user!, routeParam(req.params.id), req.body));
  } catch (error) {
    if (!(error instanceof UserAccountError)) throw error;
    return accountErrorResponse(error, res);
  }
});

export default router;
