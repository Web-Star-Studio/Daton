import { Router, type IRouter } from "express";
import { requireAuth, requireModuleAccess, requireWriteAccess } from "../middlewares/auth";
import healthRouter from "./health";
import authRouter from "./auth";
import organizationsRouter from "./organizations";
import unitsRouter from "./units";
import legislationsRouter from "./legislations";
import unitLegislationsRouter from "./unit-legislations";
import storageRouter from "./storage";
import aiRouter from "./ai";
import questionnaireRouter from "./questionnaire";
import autoTagRouter from "./auto-tag";
import employeesRouter from "./employees";
import departmentsRouter from "./departments";
import documentsRouter from "./documents";
import notificationsRouter from "./notifications";
import invitationsRouter from "./invitations";
import orgUsersRouter from "./org-users";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(storageRouter);
router.use(aiRouter);
router.use(notificationsRouter);
router.use(invitationsRouter);
router.use(orgUsersRouter);
router.use(organizationsRouter);
router.use(questionnaireRouter);

router.use("/organizations/:orgId/units", requireAuth, requireModuleAccess("units"));
router.use("/organizations/:orgId/legislations", requireAuth, requireModuleAccess("legislations"));
router.use("/organizations/:orgId/employees", requireAuth, requireModuleAccess("employees"));
router.use("/organizations/:orgId/documents", requireAuth, requireModuleAccess("documents"));
router.use("/organizations/:orgId/departments", requireAuth, requireModuleAccess("departments"));
router.use("/organizations/:orgId/positions", requireAuth, requireModuleAccess("positions"));

router.use(unitsRouter);
router.use(legislationsRouter);
router.use(unitLegislationsRouter);
router.use(employeesRouter);
router.use(departmentsRouter);
router.use(documentsRouter);
router.use(autoTagRouter);

export default router;
