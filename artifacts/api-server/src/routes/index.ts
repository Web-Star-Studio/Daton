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
import positionsRouter from "./positions";
import documentsRouter from "./documents";
import governanceRouter from "./governance/index";
import notificationsRouter from "./notifications";
import invitationsRouter from "./invitations";
import orgUsersRouter from "./org-users";
import productKnowledgeRouter from "./product-knowledge";
const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(storageRouter);
router.use(invitationsRouter);
router.use(orgUsersRouter);
router.use(organizationsRouter);

router.use(productKnowledgeRouter);
router.use(requireAuth, requireCompletedOnboarding, aiRouter);
router.use(requireAuth, requireCompletedOnboarding, notificationsRouter);
router.use(requireAuth, requireCompletedOnboarding, questionnaireRouter);
router.use(requireAuth, requireCompletedOnboarding, autoTagRouter);

router.use(requireAuth, requireCompletedOnboarding, requireModuleAccess("units"), unitsRouter);
router.use(requireAuth, requireCompletedOnboarding, requireModuleAccess("legislations"), legislationsRouter);
router.use(requireAuth, requireCompletedOnboarding, requireModuleAccess("legislations"), unitLegislationsRouter);
router.use(requireAuth, requireCompletedOnboarding, requireModuleAccess("employees"), employeesRouter);
router.use(requireAuth, requireCompletedOnboarding, requireModuleAccess("departments"), departmentsRouter);
router.use(requireAuth, requireCompletedOnboarding, requireModuleAccess("positions"), positionsRouter);
router.use(requireAuth, requireCompletedOnboarding, documentsRouter);
router.use(requireAuth, requireCompletedOnboarding, requireModuleAccess("governance"), governanceRouter);

export default router;
