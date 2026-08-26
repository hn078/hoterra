import { Router } from 'express';
import templateManagementRouter from './templateManagement';
import templateQueriesRouter from './templateQueries';

const router = Router();

router.use(templateQueriesRouter);
router.use(templateManagementRouter);

export default router;
