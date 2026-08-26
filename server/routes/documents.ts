import { Router } from 'express';
import documentCollaborationRouter from './documentCollaboration';
import documentContentRouter from './documentContent';
import documentLifecycleRouter from './documentLifecycle';
import documentQueriesRouter from './documentQueries';
import documentWorkflowRouter from './documentWorkflow';

const router = Router();

router.use(documentQueriesRouter);
router.use(documentWorkflowRouter);
router.use(documentContentRouter);
router.use(documentLifecycleRouter);
router.use(documentCollaborationRouter);

export default router;
