import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware, requireRoles } from '../middleware/auth';
import { Role, WorkflowStatus } from '@prisma/client';
import { routeParam } from '../utils';
import {
  formatWorkflow,
  serializeWorkflowSteps,
  validateWorkflowSteps,
  type WorkflowStep,
} from '../lib/workflows';

const router = Router();

router.get('/', authMiddleware, async (_req: Request, res: Response) => {
  const workflows = await prisma.workflowRoute.findMany({
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });
  res.json(workflows.map(formatWorkflow));
});

router.post(
  '/',
  authMiddleware,
  requireRoles(Role.SYSTEM_ADMINISTRATOR, Role.GENERAL_MANAGER),
  async (req: Request, res: Response) => {
    const { name, description, steps } = req.body;

    let normalizedSteps: WorkflowStep[] = [];
    if (steps !== undefined) {
      const validation = validateWorkflowSteps(steps, { allowEmpty: true });
      if (!validation.ok) return res.status(400).json({ error: validation.error });
      normalizedSteps = validation.steps;
    }

    const workflow = await prisma.workflowRoute.create({
      data: {
        name: name || 'New Workflow',
        description,
        steps: serializeWorkflowSteps(normalizedSteps),
        isDefault: false,
        status: WorkflowStatus.DRAFT,
      },
    });
    res.status(201).json(formatWorkflow(workflow));
  }
);

router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  const workflow = await prisma.workflowRoute.findUnique({
    where: { id: routeParam(req.params.id) },
  });
  if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
  res.json(formatWorkflow(workflow));
});

router.put(
  '/:id',
  authMiddleware,
  requireRoles(Role.SYSTEM_ADMINISTRATOR, Role.GENERAL_MANAGER),
  async (req: Request, res: Response) => {
    const id = routeParam(req.params.id);
    const { name, description, steps, isDefault, status } = req.body;

    const existing = await prisma.workflowRoute.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Workflow not found' });

    let stepsJson: string | undefined;
    if (steps !== undefined) {
      const validation = validateWorkflowSteps(steps, { allowEmpty: true });
      if (!validation.ok) return res.status(400).json({ error: validation.error });
      stepsJson = serializeWorkflowSteps(validation.steps);
    }

    if (isDefault === true) {
      await prisma.workflowRoute.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const workflow = await prisma.workflowRoute.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(stepsJson !== undefined && { steps: stepsJson }),
        ...(isDefault !== undefined && { isDefault: Boolean(isDefault) }),
        ...(status && Object.values(WorkflowStatus).includes(status) && { status }),
      },
    });
    res.json(formatWorkflow(workflow));
  }
);

router.patch(
  '/:id/activate',
  authMiddleware,
  requireRoles(Role.SYSTEM_ADMINISTRATOR, Role.GENERAL_MANAGER),
  async (req: Request, res: Response) => {
    const id = routeParam(req.params.id);
    const existing = await prisma.workflowRoute.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Workflow not found' });

    const steps = validateWorkflowSteps(JSON.parse(existing.steps), { allowEmpty: true });
    if (!steps.ok) return res.status(400).json({ error: steps.error });
    if (steps.steps.length === 0) {
      return res.status(400).json({ error: 'Add at least one step before activating' });
    }

    const workflow = await prisma.workflowRoute.update({
      where: { id },
      data: { status: WorkflowStatus.ACTIVE },
    });
    res.json(formatWorkflow(workflow));
  }
);

router.patch(
  '/:id/default',
  authMiddleware,
  requireRoles(Role.SYSTEM_ADMINISTRATOR, Role.GENERAL_MANAGER),
  async (req: Request, res: Response) => {
    const id = routeParam(req.params.id);
    const { isDefault } = req.body as { isDefault?: boolean };

    const existing = await prisma.workflowRoute.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Workflow not found' });

    const shouldDefault = isDefault !== false;

    if (shouldDefault && existing.status !== WorkflowStatus.ACTIVE) {
      return res.status(400).json({ error: 'Only active workflows can be set as default' });
    }

    if (shouldDefault) {
      await prisma.workflowRoute.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const workflow = await prisma.workflowRoute.update({
      where: { id },
      data: { isDefault: shouldDefault },
    });
    res.json(formatWorkflow(workflow));
  }
);

router.delete(
  '/:id',
  authMiddleware,
  requireRoles(Role.SYSTEM_ADMINISTRATOR, Role.GENERAL_MANAGER),
  async (req: Request, res: Response) => {
    await prisma.workflowRoute.delete({ where: { id: routeParam(req.params.id) } });
    res.json({ ok: true });
  }
);

export default router;
