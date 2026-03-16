import { Router, type IRouter } from "express";
import { requireAuth, requireCompletedOnboarding, requireModuleAccess } from "../middlewares/auth";
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
router.use(invitationsRouter);
router.use(orgUsersRouter);
router.use(organizationsRouter);

router.use("/ai", requireAuth, requireCompletedOnboarding);
router.use("/compliance-tag-vocabulary", requireAuth, requireCompletedOnboarding);
router.use("/organizations/:orgId/notifications", requireAuth, requireCompletedOnboarding);
router.use("/organizations/:orgId/questionnaire", requireAuth, requireCompletedOnboarding);
router.use("/organizations/:orgId/units/:unitId/questionnaire", requireAuth, requireCompletedOnboarding);
router.use("/organizations/:orgId/user-options", requireAuth, requireCompletedOnboarding);

router.use("/organizations/:orgId/units", requireAuth, requireCompletedOnboarding, requireModuleAccess("units"));
router.use("/organizations/:orgId/legislations", requireAuth, requireCompletedOnboarding, requireModuleAccess("legislations"));
router.use("/organizations/:orgId/employees", requireAuth, requireCompletedOnboarding, requireModuleAccess("employees"));
router.use("/organizations/:orgId/documents", requireAuth, requireCompletedOnboarding, requireModuleAccess("documents"));
router.use("/organizations/:orgId/departments", requireAuth, requireCompletedOnboarding, requireModuleAccess("departments"));
router.use("/organizations/:orgId/positions", requireAuth, requireCompletedOnboarding, requireModuleAccess("positions"));

router.use(aiRouter);
router.use(notificationsRouter);
router.use(questionnaireRouter);
router.use(unitsRouter);
router.use(legislationsRouter);
router.use(unitLegislationsRouter);
router.use(employeesRouter);
router.use(departmentsRouter);
router.use(documentsRouter);
router.use(autoTagRouter);

export default router;
