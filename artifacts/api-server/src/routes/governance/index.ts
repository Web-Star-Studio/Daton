import { Router, type IRouter } from "express";
import plansRouter from "./plans";
import projectDevelopmentRouter from "./project-development";
import resourcesRouter from "./resources";
import systemRouter from "./system";

const router: IRouter = Router();

router.use(plansRouter);
router.use(resourcesRouter);
router.use(systemRouter);
router.use(projectDevelopmentRouter);

export default router;
