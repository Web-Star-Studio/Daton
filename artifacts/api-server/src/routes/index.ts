import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import organizationsRouter from "./organizations";
import unitsRouter from "./units";
import legislationsRouter from "./legislations";
import unitLegislationsRouter from "./unit-legislations";
import storageRouter from "./storage";
import aiRouter from "./ai";
import questionnaireRouter from "./questionnaire";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(organizationsRouter);
router.use(unitsRouter);
router.use(legislationsRouter);
router.use(unitLegislationsRouter);
router.use(storageRouter);
router.use(aiRouter);
router.use(questionnaireRouter);

export default router;
