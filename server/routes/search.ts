import { Router } from 'express';
import searchQueriesRouter from './searchQueries';

const router = Router();

router.use(searchQueriesRouter);

export default router;
