import { Router } from 'express';
import settingsBusinessRouter from './settingsBusiness';
import settingsQueriesRouter from './settingsQueries';
import settingsSecurityRouter from './settingsSecurity';

const router = Router();

router.use(settingsQueriesRouter);
router.use(settingsBusinessRouter);
router.use(settingsSecurityRouter);

export default router;
