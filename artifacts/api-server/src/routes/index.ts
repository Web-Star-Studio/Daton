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
import trainingCatalogRouter from "./training-catalog";
import competencyCatalogRouter from "./competency-catalog";
import trainingRequirementsRouter from "./training-requirements";
import trainingClassesRouter from "./training-classes";
import annualProgramRouter from "./annual-program";
import departmentsRouter from "./departments";
import positionsRouter from "./positions";
import documentsRouter from "./documents";
import environmentalRouter from "./environmental/index";
import governanceRouter from "./governance/index";
import notificationsRouter from "./notifications";
import invitationsRouter from "./invitations";
import passwordResetRouter from "./password-reset";
import orgUsersRouter from "./org-users";
import organizationContactsRouter from "./organization-contacts";
import productKnowledgeRouter from "./product-knowledge";
import suppliersRouter from "./suppliers";
import kpiRouter from "./kpi/index";
import roadSafetyRouter from "./road-safety/index";
import criticalReviewsRouter from "./critical-reviews";
import actionPlansRouter from "./action-plans";
import swotRouter from "./swot/index";
import assetsRouter from "./assets";
import assetMaintenanceRouter from "./asset-maintenance";
import workEnvironmentRouter from "./work-environment";
import measurementResourcesRouter from "./measurement-resources";
import regulatoryDocumentsRouter from "./regulatory-documents";
import regulatoryNormsRouter from "./regulatory-norms";
import pendenciasRouter from "./pendencias";
import learningSummaryRouter from "./learning-summary";
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
router.use(passwordResetRouter);
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
  requireModuleAccessForPaths("employees", [
    /^\/organizations\/[^/]+\/training-catalog(?:\/|$)/,
  ]),
  trainingCatalogRouter,
);
router.use(
  requireAuth,
  requireCompletedOnboarding,
  requireModuleAccessForPaths("employees", [
    /^\/organizations\/[^/]+\/competency-catalog(?:\/|$)/,
  ]),
  competencyCatalogRouter,
);
router.use(
  requireAuth,
  requireCompletedOnboarding,
  requireModuleAccessForPaths("employees", [
    /^\/organizations\/[^/]+\/training-requirements(?:\/|$)/,
  ]),
  trainingRequirementsRouter,
);
router.use(
  requireAuth,
  requireCompletedOnboarding,
  requireModuleAccessForPaths("employees", [
    /^\/organizations\/[^/]+\/training-classes(?:\/|$)/,
  ]),
  trainingClassesRouter,
);
router.use(
  requireAuth,
  requireCompletedOnboarding,
  requireModuleAccessForPaths("employees", [
    /^\/organizations\/[^/]+\/annual-program(?:\/|$)/,
  ]),
  annualProgramRouter,
);
router.use(
  requireAuth,
  requireCompletedOnboarding,
  requireModuleAccessForPaths("employees", [
    /^\/organizations\/[^/]+\/learning\/summary(?:\/|$)/,
  ]),
  learningSummaryRouter,
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
  requireModuleAccessForPaths("environmental", [
    /^\/organizations\/[^/]+\/environmental(?:\/|$)/,
  ]),
  environmentalRouter,
);
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
    /^\/organizations\/[^/]+\/suppliers(?:\/|$)/,
  ]),
  suppliersRouter,
);
router.use(
  requireAuth,
  requireCompletedOnboarding,
  requireModuleAccessForPaths("kpi", [/^\/organizations\/[^/]+\/kpi(?:\/|$)/]),
  kpiRouter,
  criticalReviewsRouter,
);
router.use(
  requireAuth,
  requireCompletedOnboarding,
  requireModuleAccessForPaths("roadSafety", [
    /^\/organizations\/[^/]+\/road-safety(?:\/|$)/,
  ]),
  roadSafetyRouter,
);
router.use(requireAuth, requireCompletedOnboarding, actionPlansRouter);
router.use(requireAuth, requireCompletedOnboarding, pendenciasRouter);
router.use(
  requireAuth,
  requireCompletedOnboarding,
  requireModuleAccessForPaths("swot", [/^\/organizations\/[^/]+\/swot(?:\/|$)/]),
  swotRouter,
);
router.use(
  requireAuth,
  requireCompletedOnboarding,
  requireModuleAccessForPaths("assets", [
    /^\/organizations\/[^/]+\/assets(?:\/|$)/,
    /^\/organizations\/[^/]+\/work-environment(?:\/|$)/,
    /^\/organizations\/[^/]+\/measurement-resources(?:\/|$)/,
  ]),
  assetsRouter,
  assetMaintenanceRouter,
  workEnvironmentRouter,
  measurementResourcesRouter,
);
router.use(
  requireAuth,
  requireCompletedOnboarding,
  requireModuleAccessForPaths("regulatoryDocuments", [
    /^\/organizations\/[^/]+\/regulatory-documents(?:\/|$)/,
  ]),
  regulatoryDocumentsRouter,
);
// Sem requireModuleAccessForPaths: o catálogo de normas é cross-module (usado
// por KPI, obrigatoriedade de treinamento etc.) — leitura livre a qualquer
// usuário autenticado da org; a gate admin na escrita vive na própria rota
// (requireRole("org_admin")).
router.use(requireAuth, requireCompletedOnboarding, regulatoryNormsRouter);

export default router;
