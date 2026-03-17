import { Router, type IRouter } from "express";
import plansRouter from "./plans";
import resourcesRouter from "./resources";

const router: IRouter = Router();

router.use(plansRouter);
router.use(resourcesRouter);

export default router;
