import { Router } from 'express';
import departmentManagementRouter from './departmentManagement';
import departmentQueriesRouter from './departmentQueries';

const router = Router();

router.use(departmentQueriesRouter);
router.use(departmentManagementRouter);

export default router;
