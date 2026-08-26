import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requireCapability } from '../modules/access-control';
import conversationManagementRouter from './conversationManagement';
import conversationMessagesRouter from './conversationMessages';
import conversationQueriesRouter from './conversationQueries';

const router = Router();

router.use(authMiddleware, requireCapability('messages.use'));
router.use(conversationQueriesRouter);
router.use(conversationManagementRouter);
router.use(conversationMessagesRouter);

export default router;
