import { Router, type Response } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { authMiddleware } from '../middleware/auth';
import { requireCapability } from '../modules/access-control';
import {
  createWorkforceTemplate,
  disableWorkforceTemplate,
  getWorkforceMeta,
  saveDepartmentCasualBudget,
  saveWorkforceApprovalRoute,
  updateWorkforceSettings,
  updateWorkforceTemplate,
  WorkforceAdministrationError,
  WorkforceMetaReadError,
  WorkforceSettingsError,
  WorkforceTemplateError,
} from '../modules/workforce';
import { routeParam } from '../utils';

const router = Router();

function sendAdministrationError(res: Response, error: WorkforceAdministrationError) {
  if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'Department not found' });
  if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Workforce administration permission required' });
  if (error.code === 'INVALID_APPROVER') return res.status(400).json({ error: 'Selected approver is inactive, has the wrong role, or belongs to the wrong department' });
  if (error.code === 'HR_DEPARTMENT_REQUIRED') return res.status(400).json({ error: 'Human Resources department must exist before saving approval routes' });
  return res.status(400).json({ error: 'Invalid workforce administration values' });
}

function sendTemplateError(res: Response, error: WorkforceTemplateError) {
  if (error.code === 'NOT_FOUND') return res.status(404).json({ error: 'Workforce template not found' });
  if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'You can only manage templates for your own department' });
  if (error.code === 'RECURRING_FORBIDDEN') return res.status(403).json({ error: 'Recurring workforce templates require hotel-wide workforce settings permission' });
  if (error.code === 'INVALID_REFERENCE') return res.status(400).json({ error: 'Template department, position, or vendor is invalid or inactive' });
  return res.status(400).json({ error: 'Invalid workforce template values' });
}

router.get('/meta', authMiddleware, requireCapability('workforce.read'), asyncHandler(async (req, res) => {
  try {
    res.json(await getWorkforceMeta(prisma, req.user!));
  } catch (error) {
    if (!(error instanceof WorkforceMetaReadError)) throw error;
    return res.status(403).json({ error: 'Workforce access required' });
  }
}));

router.patch('/settings', authMiddleware, requireCapability('workforce.settings.manage'), asyncHandler(async (req, res) => {
  try {
    res.json(await updateWorkforceSettings(prisma, req.user!, req.body));
  } catch (error) {
    if (!(error instanceof WorkforceSettingsError)) throw error;
    if (error.code === 'FORBIDDEN') return res.status(403).json({ error: 'Workforce settings permission required' });
    return res.status(400).json({ error: 'Invalid workforce settings values' });
  }
}));

router.put('/routes/:departmentId', authMiddleware, requireCapability('workforce.routes.manage'), asyncHandler(async (req, res) => {
  try {
    res.json(await saveWorkforceApprovalRoute(prisma, req.user!, routeParam(req.params.departmentId), req.body));
  } catch (error) {
    if (!(error instanceof WorkforceAdministrationError)) throw error;
    return sendAdministrationError(res, error);
  }
}));

router.put('/budgets', authMiddleware, requireCapability('workforce.budget.manage'), asyncHandler(async (req, res) => {
  try {
    res.json(await saveDepartmentCasualBudget(prisma, req.user!, req.body));
  } catch (error) {
    if (!(error instanceof WorkforceAdministrationError)) throw error;
    return sendAdministrationError(res, error);
  }
}));

router.post('/templates', authMiddleware, requireCapability('workforce.templates.manage'), asyncHandler(async (req, res) => {
  try {
    res.status(201).json(await createWorkforceTemplate(prisma, req.user!, req.body));
  } catch (error) {
    if (!(error instanceof WorkforceTemplateError)) throw error;
    return sendTemplateError(res, error);
  }
}));

router.patch('/templates/:id', authMiddleware, requireCapability('workforce.templates.manage'), asyncHandler(async (req, res) => {
  try {
    res.json(await updateWorkforceTemplate(prisma, req.user!, routeParam(req.params.id), req.body));
  } catch (error) {
    if (!(error instanceof WorkforceTemplateError)) throw error;
    return sendTemplateError(res, error);
  }
}));

router.delete('/templates/:id', authMiddleware, requireCapability('workforce.templates.manage'), asyncHandler(async (req, res) => {
  try {
    res.json(await disableWorkforceTemplate(prisma, req.user!, routeParam(req.params.id)));
  } catch (error) {
    if (!(error instanceof WorkforceTemplateError)) throw error;
    return sendTemplateError(res, error);
  }
}));

export default router;
