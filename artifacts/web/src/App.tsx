import { useEffect, useLayoutEffect, useMemo } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";

import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { LayoutProvider } from "@/contexts/LayoutContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { AdminLayout } from "@/components/layout/AdminLayout";

import AuthPage from "@/pages/auth";
import OnboardingOrganizationPage from "@/pages/onboarding-organizacao";
import AppIndex from "@/pages/app/index";
import OrganizacaoOverviewPage from "@/pages/app/organizacao/visao-geral";
import OrganizacaoUnitsPage from "@/pages/app/organizacao/unidades";
import OrganizacaoDepartmentsPage from "@/pages/app/organizacao/departamentos";
import OrganizacaoPositionsPage from "@/pages/app/organizacao/cargos";
import OrganizacaoEmployeesPage from "@/pages/app/organizacao/colaboradores";
import OrganizacaoEmployeeTrainingsPage from "@/pages/app/organizacao/colaboradores/treinamentos";
import OrganizacaoTrainingDetailPage from "@/pages/app/organizacao/colaboradores/treinamento-detalhe";
import OrganizacaoEmployeeDetailPage from "@/pages/app/organizacao/colaboradores/[id]";
import UnitDetailPage from "@/pages/app/organizacao/unidades/[id]";
import GovernancePage from "@/pages/app/governanca";
import GovernanceDetailPage from "@/pages/app/governanca/[id]";
import GovernanceManagementReviewsPage from "@/pages/app/governanca/analises-criticas";
import GovernanceAuditsPage from "@/pages/app/governanca/auditorias";
import GovernanceKnowledgeAssetsPage from "@/pages/app/governanca/conhecimento-critico";
import GovernanceNonconformitiesPage from "@/pages/app/governanca/nao-conformidades";
import OperationalPlanningPage from "@/pages/app/governanca/planejamento-operacional";
import ProjectDevelopmentPage from "@/pages/app/governanca/projeto-desenvolvimento";
import GovernanceProcessesPage from "@/pages/app/governanca/processos-sgq";
import GovernanceRiskOpportunityPage from "@/pages/app/governanca/riscos-oportunidades";
import AdminDashboardPage from "@/pages/app/admin/index";
import ProductKnowledgeAdminPage from "@/pages/app/admin/base-conhecimento";
import LegislacoesPage from "@/pages/app/qualidade/legislacoes";
import LegislationDetailPage from "@/pages/app/qualidade/legislacoes/[id]";
import DocumentacaoPage from "@/pages/app/qualidade/documentacao";
import DocumentDetailPage from "@/pages/app/qualidade/documentacao/[id]";
import SuppliersPage from "@/pages/app/qualidade/fornecedores";
import SupplierCategoriesPage from "@/pages/app/qualidade/fornecedores/categorias";
import SupplierCatalogItemsPage from "@/pages/app/qualidade/fornecedores/catalogo-itens";
import SupplierMasterEditPage from "@/pages/app/qualidade/fornecedores/[id]-cadastro";
import SupplierDetailPage from "@/pages/app/qualidade/fornecedores/[id]";
import SupplierDocumentRequirementsPage from "@/pages/app/qualidade/fornecedores/requisitos-documentais";
import SupplierTypesPage from "@/pages/app/qualidade/fornecedores/tipos";
import EnvironmentalLaiaPage from "@/pages/app/ambiental/laia";
import EnvironmentalLaiaUnitDetailPage from "@/pages/app/ambiental/laia/unidades/[unitId]";
import KpiIndicadoresPage from "@/pages/app/kpi/indicadores";
import KpiLancamentosPage from "@/pages/app/kpi/lancamentos";
import KpiDashboardPage from "@/pages/app/kpi/dashboard";
import AtivosPage from "@/pages/app/organizacao/ativos";
import AmbientePage from "@/pages/app/infraestrutura/ambiente";
import MedicaoPage from "@/pages/app/infraestrutura/medicao";
import ProfileSettingsPage from "@/pages/app/configuracoes/perfil";
import SystemSettingsPage from "@/pages/app/configuracoes/sistema";
import AcceptInvitePage from "@/pages/accept-invite";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const LEGACY_THEME_STORAGE_KEY = "theme";
const ANONYMOUS_THEME_STORAGE_KEY = "daton_theme_anonymous";

function getUserThemeStorageKey(userId: number | string | undefined) {
  return userId ? `daton_theme_user_${userId}` : ANONYMOUS_THEME_STORAGE_KEY;
}

function UserScopedThemeProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const storageKey = getUserThemeStorageKey(user?.id);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const currentStoredTheme = window.localStorage.getItem(storageKey);
    if (currentStoredTheme) return;

    const legacyStoredTheme = window.localStorage.getItem(
      LEGACY_THEME_STORAGE_KEY,
    );
    if (!legacyStoredTheme) return;

    window.localStorage.setItem(storageKey, legacyStoredTheme);

    if (isAuthenticated && user?.id) {
      window.localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
    }
  }, [isAuthenticated, storageKey, user?.id]);

  return (
    <ThemeProvider
      key={storageKey}
      attribute="class"
      storageKey={storageKey}
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}

function AdminPages() {
  return (
    <Switch>
      <Route path="/admin" component={AdminDashboardPage} />
      <Route
        path="/admin/base-conhecimento"
        component={ProductKnowledgeAdminPage}
      />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppPages() {
  return (
    <Switch>
      <Route path="/organizacao" component={OrganizacaoOverviewPage} />
      <Route
        path="/organizacao/colaboradores"
        component={OrganizacaoEmployeesPage}
      />
      <Route
        path="/organizacao/colaboradores/treinamentos"
        component={OrganizacaoEmployeeTrainingsPage}
      />
      <Route
        path="/organizacao/colaboradores/treinamentos/:title"
        component={OrganizacaoTrainingDetailPage}
      />
      <Route
        path="/organizacao/colaboradores/:id"
        component={OrganizacaoEmployeeDetailPage}
      />
      <Route path="/organizacao/unidades" component={OrganizacaoUnitsPage} />
      <Route path="/organizacao/unidades/:id" component={UnitDetailPage} />
      <Route
        path="/organizacao/departamentos"
        component={OrganizacaoDepartmentsPage}
      />
      <Route path="/organizacao/cargos" component={OrganizacaoPositionsPage} />
      <Route path="/infraestrutura/ativos" component={AtivosPage} />
      <Route path="/app/infraestrutura/ativos" component={AtivosPage} />
      <Route path="/infraestrutura/ambiente" component={AmbientePage} />
      <Route path="/app/infraestrutura/ambiente" component={AmbientePage} />
      <Route path="/infraestrutura/medicao" component={MedicaoPage} />
      <Route path="/app/infraestrutura/medicao" component={MedicaoPage} />
      <Route path="/governanca/planejamento" component={GovernancePage} />
      <Route
        path="/governanca/planejamento/:id"
        component={GovernanceDetailPage}
      />
      <Route
        path="/governanca/riscos-oportunidades"
        component={GovernanceRiskOpportunityPage}
      />
      <Route
        path="/governanca/planejamento-operacional"
        component={OperationalPlanningPage}
      />
      <Route
        path="/governanca/processos-sgq"
        component={GovernanceProcessesPage}
      />
      <Route
        path="/governanca/projeto-desenvolvimento"
        component={ProjectDevelopmentPage}
      />
      <Route
        path="/governanca/conhecimento-critico"
        component={GovernanceKnowledgeAssetsPage}
      />
      <Route path="/governanca/auditorias" component={GovernanceAuditsPage} />
      <Route
        path="/governanca/nao-conformidades"
        component={GovernanceNonconformitiesPage}
      />
      <Route
        path="/governanca/analises-criticas"
        component={GovernanceManagementReviewsPage}
      />
      <Route path="/qualidade/legislacoes" component={LegislacoesPage} />
      <Route
        path="/qualidade/legislacoes/:id"
        component={LegislationDetailPage}
      />
      <Route path="/qualidade/documentacao" component={DocumentacaoPage} />
      <Route
        path="/qualidade/documentacao/:id"
        component={DocumentDetailPage}
      />
      <Route path="/qualidade/fornecedores" component={SuppliersPage} />
      <Route
        path="/qualidade/fornecedores/categorias"
        component={SupplierCategoriesPage}
      />
      <Route
        path="/qualidade/fornecedores/catalogo-itens"
        component={SupplierCatalogItemsPage}
      />
      <Route
        path="/qualidade/fornecedores/tipos"
        component={SupplierTypesPage}
      />
      <Route
        path="/qualidade/fornecedores/requisitos-documentais"
        component={SupplierDocumentRequirementsPage}
      />
      <Route
        path="/qualidade/fornecedores/:id/cadastro"
        component={SupplierMasterEditPage}
      />
      <Route
        path="/qualidade/fornecedores/:id"
        component={SupplierDetailPage}
      />
      <Route
        path="/ambiental/laia/unidades/:unitId"
        component={EnvironmentalLaiaUnitDetailPage}
      />
      <Route path="/ambiental/laia" component={EnvironmentalLaiaPage} />
      <Route path="/kpi/indicadores" component={KpiIndicadoresPage} />
      <Route path="/kpi/lancamentos" component={KpiLancamentosPage} />
      <Route path="/kpi/dashboard" component={KpiDashboardPage} />
      <Route path="/configuracoes/perfil" component={ProfileSettingsPage} />
      <Route path="/configuracoes/sistema" component={SystemSettingsPage} />
      <Route path="/app" component={AppIndex} />
      <Route path="/app/organizacao" component={OrganizacaoOverviewPage} />
      <Route
        path="/app/organizacao/colaboradores"
        component={OrganizacaoEmployeesPage}
      />
      <Route
        path="/app/organizacao/colaboradores/treinamentos"
        component={OrganizacaoEmployeeTrainingsPage}
      />
      <Route
        path="/app/organizacao/colaboradores/treinamentos/:title"
        component={OrganizacaoTrainingDetailPage}
      />
      <Route
        path="/app/organizacao/colaboradores/:id"
        component={OrganizacaoEmployeeDetailPage}
      />
      <Route
        path="/app/organizacao/unidades"
        component={OrganizacaoUnitsPage}
      />
      <Route path="/app/organizacao/unidades/:id" component={UnitDetailPage} />
      <Route
        path="/app/organizacao/departamentos"
        component={OrganizacaoDepartmentsPage}
      />
      <Route
        path="/app/organizacao/cargos"
        component={OrganizacaoPositionsPage}
      />
      <Route path="/app/governanca/planejamento" component={GovernancePage} />
      <Route
        path="/app/governanca/planejamento/:id"
        component={GovernanceDetailPage}
      />
      <Route
        path="/app/governanca/riscos-oportunidades"
        component={GovernanceRiskOpportunityPage}
      />
      <Route
        path="/app/governanca/planejamento-operacional"
        component={OperationalPlanningPage}
      />
      <Route
        path="/app/governanca/processos-sgq"
        component={GovernanceProcessesPage}
      />
      <Route
        path="/app/governanca/projeto-desenvolvimento"
        component={ProjectDevelopmentPage}
      />
      <Route
        path="/app/governanca/conhecimento-critico"
        component={GovernanceKnowledgeAssetsPage}
      />
      <Route
        path="/app/governanca/auditorias"
        component={GovernanceAuditsPage}
      />
      <Route
        path="/app/governanca/nao-conformidades"
        component={GovernanceNonconformitiesPage}
      />
      <Route
        path="/app/governanca/analises-criticas"
        component={GovernanceManagementReviewsPage}
      />
      <Route path="/app/qualidade/legislacoes" component={LegislacoesPage} />
      <Route
        path="/app/qualidade/legislacoes/:id"
        component={LegislationDetailPage}
      />
      <Route path="/app/qualidade/documentacao" component={DocumentacaoPage} />
      <Route
        path="/app/qualidade/documentacao/:id"
        component={DocumentDetailPage}
      />
      <Route path="/app/qualidade/fornecedores" component={SuppliersPage} />
      <Route
        path="/app/qualidade/fornecedores/categorias"
        component={SupplierCategoriesPage}
      />
      <Route
        path="/app/qualidade/fornecedores/catalogo-itens"
        component={SupplierCatalogItemsPage}
      />
      <Route
        path="/app/qualidade/fornecedores/tipos"
        component={SupplierTypesPage}
      />
      <Route
        path="/app/qualidade/fornecedores/requisitos-documentais"
        component={SupplierDocumentRequirementsPage}
      />
      <Route
        path="/app/qualidade/fornecedores/:id/cadastro"
        component={SupplierMasterEditPage}
      />
      <Route
        path="/app/qualidade/fornecedores/:id"
        component={SupplierDetailPage}
      />
      <Route
        path="/app/ambiental/laia/unidades/:unitId"
        component={EnvironmentalLaiaUnitDetailPage}
      />
      <Route path="/app/ambiental/laia" component={EnvironmentalLaiaPage} />
      <Route path="/app/kpi/indicadores" component={KpiIndicadoresPage} />
      <Route path="/app/kpi/lancamentos" component={KpiLancamentosPage} />
      <Route path="/app/kpi/dashboard" component={KpiDashboardPage} />
      <Route path="/app/configuracoes/perfil" component={ProfileSettingsPage} />
      <Route path="/app/configuracoes/sistema" component={SystemSettingsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function Router() {
  const [location, navigate] = useLocation();
  const { isAuthenticated, isLoading, organization, role } = useAuth();
  const isAdminRoute = location.startsWith("/admin");
  const isOrgRoute =
    location.startsWith("/app") ||
    location.startsWith("/organizacao") ||
    location.startsWith("/governanca") ||
    location.startsWith("/qualidade") ||
    location.startsWith("/ambiental") ||
    location.startsWith("/kpi") ||
    location.startsWith("/infraestrutura") ||
    location.startsWith("/configuracoes");
  const isAppRoute = isAdminRoute || isOrgRoute;
  const isAuthRoute = location === "/" || location.startsWith("/auth");
  const isOnboardingRoute = location.startsWith("/onboarding/organizacao");
  const onboardingPending = organization?.onboardingStatus === "pending";
  const isPlatformAdmin = role === "platform_admin";
  const redirectTo = useMemo(() => {
    if (isLoading) return null;
    if (!isAuthenticated && (isAppRoute || isOnboardingRoute)) return "/auth";
    if (isAuthenticated && isAuthRoute && isPlatformAdmin) return "/admin";
    if (
      isAuthenticated &&
      onboardingPending &&
      !isOnboardingRoute &&
      !isPlatformAdmin
    ) {
      return "/onboarding/organizacao";
    }
    if (
      isAuthenticated &&
      !onboardingPending &&
      (isOnboardingRoute || isAuthRoute)
    )
      return "/organizacao";
    return null;
  }, [
    isAppRoute,
    isAuthRoute,
    isAuthenticated,
    isLoading,
    isOnboardingRoute,
    onboardingPending,
    isPlatformAdmin,
  ]);

  useLayoutEffect(() => {
    if (redirectTo && redirectTo !== location) {
      navigate(redirectTo);
    }
  }, [location, navigate, redirectTo]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Carregando sessão...</p>
      </div>
    );
  }

  if (redirectTo && redirectTo !== location) {
    return null;
  }

  if (isAdminRoute) {
    return (
      <LayoutProvider>
        <AdminLayout>
          <AdminPages />
        </AdminLayout>
      </LayoutProvider>
    );
  }

  if (isOrgRoute) {
    return (
      <LayoutProvider>
        <AppLayout>
          <AppPages />
        </AppLayout>
      </LayoutProvider>
    );
  }

  return (
    <Switch>
      <Route path="/" component={AuthPage} />
      <Route path="/auth" component={AuthPage} />
      <Route
        path="/onboarding/organizacao"
        component={OnboardingOrganizationPage}
      />
      <Route path="/auth/esqueci-minha-senha" component={ForgotPasswordPage} />
      <Route path="/auth/redefinir-senha" component={ResetPasswordPage} />
      <Route path="/convite/:token" component={AcceptInvitePage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <UserScopedThemeProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </UserScopedThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
