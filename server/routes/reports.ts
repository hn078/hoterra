import { Router } from 'express';
import reportExportRouter from './reportExport';
import reportQueriesRouter from './reportQueries';

const router = Router();
router.use(reportQueriesRouter);
router.use(reportExportRouter);
export default router;
