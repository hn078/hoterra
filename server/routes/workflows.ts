import { Router } from 'express';
import workflowManagementRouter from './workflowManagement';
import workflowQueriesRouter from './workflowQueries';

const router = Router();

router.use(workflowQueriesRouter);
router.use(workflowManagementRouter);

export default router;
