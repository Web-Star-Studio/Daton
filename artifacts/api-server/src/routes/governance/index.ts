import { Router, type IRouter } from "express";
import operationalPlanningRouter from "./operational-planning";
import plansRouter from "./plans";
import operationsRouter from "./operations";
import projectDevelopmentRouter from "./project-development";
import resourcesRouter from "./resources";
import systemRouter from "./system";

const router: IRouter = Router();

router.use(plansRouter);
router.use(resourcesRouter);
router.use(systemRouter);
router.use(operationalPlanningRouter);
router.use(operationsRouter);
router.use(projectDevelopmentRouter);

export default router;
