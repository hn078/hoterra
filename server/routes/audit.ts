import { Router } from 'express';
import auditExportRouter from './auditExport';
import auditQueriesRouter from './auditQueries';

const router = Router();

router.use(auditQueriesRouter);
router.use(auditExportRouter);

export default router;
