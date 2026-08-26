import { Router } from 'express';
import userAccountsRouter from './userAccounts';
import userQueriesRouter from './userQueries';
import userSignatureRouter from './userSignature';

const router = Router();

router.use(userAccountsRouter);
router.use(userQueriesRouter);
router.use(userSignatureRouter);

export default router;
