import { Router } from "express";
import laiaRouter from "./laia";

const router = Router();

router.use(laiaRouter);

export default router;
