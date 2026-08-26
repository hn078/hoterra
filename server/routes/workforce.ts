import { Router } from 'express';
import workforceCatalogRouter from './workforceCatalog';
import workforceConfigurationRouter from './workforceConfiguration';
import workforceDecisionsRouter from './workforceDecisions';
import workforceLifecycleRouter from './workforceLifecycle';
import workforceOperationsRouter from './workforceOperations';
import workforcePayrollRouter from './workforcePayroll';
import workforcePlanningRouter from './workforcePlanning';
import workforceProcurementRouter from './workforceProcurement';
import workforceReportsRouter from './workforceReports';
import workforceSimulationRouter from './workforceSimulation';

const router = Router();

router.use(workforceConfigurationRouter);
router.use(workforceCatalogRouter);

router.use(workforceReportsRouter);
router.use(workforcePlanningRouter);
router.use(workforceDecisionsRouter);
router.use(workforceProcurementRouter);
router.use(workforceLifecycleRouter);

router.use(workforcePayrollRouter);
router.use(workforceOperationsRouter);
router.use(workforceSimulationRouter);

export default router;
