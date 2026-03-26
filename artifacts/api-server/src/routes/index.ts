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
import organizationContactsRouter from "./organization-contacts";
import productKnowledgeRouter from "./product-knowledge";
import suppliersRouter from "./suppliers";
const router: IRouter = Router();

function requireModuleAccessForPaths(
  moduleName: Parameters<typeof requireModuleAccess>[0],
  patterns: RegExp[],
) {
  const middleware = requireModuleAccess(moduleName);

  return (req: Parameters<typeof middleware>[0], res: Parameters<typeof middleware>[1], next: Parameters<typeof middleware>[2]) => {
    if (!patterns.some((pattern) => pattern.test(req.path))) {
      next();
      return;
    }

    return middleware(req, res, next);
  };
}

router.use(healthRouter);
router.use(authRouter);
router.use(storageRouter);
router.use(invitationsRouter);
router.use(orgUsersRouter);
router.use(organizationContactsRouter);
router.use(organizationsRouter);

router.use(productKnowledgeRouter);
router.use(requireAuth, requireCompletedOnboarding, aiRouter);
router.use(requireAuth, requireCompletedOnboarding, notificationsRouter);
router.use(requireAuth, requireCompletedOnboarding, questionnaireRouter);
router.use(requireAuth, requireCompletedOnboarding, autoTagRouter);

router.use(
  requireAuth,
  requireCompletedOnboarding,
  requireModuleAccessForPaths("units", [/^\/organizations\/[^/]+\/units(?:\/|$)/]),
  unitsRouter,
);
router.use(
  requireAuth,
  requireCompletedOnboarding,
  requireModuleAccessForPaths("legislations", [
    /^\/organizations\/[^/]+\/legislations(?:\/|$)/,
    /^\/organizations\/[^/]+\/units\/[^/]+\/legislations(?:\/|$)/,
  ]),
  legislationsRouter,
);
router.use(
  requireAuth,
  requireCompletedOnboarding,
  requireModuleAccessForPaths("legislations", [
    /^\/organizations\/[^/]+\/legislations(?:\/|$)/,
    /^\/organizations\/[^/]+\/units\/[^/]+\/legislations(?:\/|$)/,
  ]),
  unitLegislationsRouter,
);
router.use(
  requireAuth,
  requireCompletedOnboarding,
  requireModuleAccessForPaths("employees", [
    /^\/organizations\/[^/]+\/employees(?:\/|$)/,
  ]),
  employeesRouter,
);
router.use(
  requireAuth,
  requireCompletedOnboarding,
  requireModuleAccessForPaths("departments", [
    /^\/organizations\/[^/]+\/departments(?:\/|$)/,
  ]),
  departmentsRouter,
);
router.use(
  requireAuth,
  requireCompletedOnboarding,
  requireModuleAccessForPaths("positions", [
    /^\/organizations\/[^/]+\/positions(?:\/|$)/,
  ]),
  positionsRouter,
);
router.use(requireAuth, requireCompletedOnboarding, documentsRouter);
router.use(
  requireAuth,
  requireCompletedOnboarding,
  requireModuleAccessForPaths("governance", [
    /^\/organizations\/[^/]+\/governance(?:\/|$)/,
  ]),
  governanceRouter,
);
router.use(
  requireAuth,
  requireCompletedOnboarding,
  requireModuleAccessForPaths("suppliers", [
    /^\/organizations\/[^/]+\/supplier-categories(?:\/|$)/,
    /^\/organizations\/[^/]+\/supplier-types(?:\/|$)/,
    /^\/organizations\/[^/]+\/supplier-document-requirements(?:\/|$)/,
    /^\/organizations\/[^/]+\/supplier-requirement-templates(?:\/|$)/,
    /^\/organizations\/[^/]+\/suppliers(?:\/|$)/,
  ]),
  suppliersRouter,
);

export default router;
