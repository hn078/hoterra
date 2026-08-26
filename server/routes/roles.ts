import { Router } from 'express';
import roleManagementRouter from './roleManagement';
import roleQueriesRouter from './roleQueries';

const router = Router();

router.use(roleQueriesRouter);
router.use(roleManagementRouter);

export default router;
