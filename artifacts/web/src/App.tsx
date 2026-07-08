import { useEffect, useLayoutEffect, useMemo } from "react";
import {
  Switch,
  Route,
  Redirect,
  Router as WouterRouter,
  useLocation,
  useSearch,
} from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider, useTheme } from "next-themes";
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
import OrganizacaoSwotPage from "@/pages/app/organizacao/swot";
import AprendizagemDashboardPage from "@/pages/app/aprendizagem/dashboard";
import AprendizagemEmployeesPage from "@/pages/app/aprendizagem/colaboradores";
import AprendizagemCatalogoPage from "@/pages/app/aprendizagem/catalogo";
import AprendizagemCargosPage from "@/pages/app/aprendizagem/cargos";
import AprendizagemObrigatoriedadesPage from "@/pages/app/aprendizagem/obrigatoriedades";
import AprendizagemTurmasPage from "@/pages/app/aprendizagem/turmas";
import AprendizagemProgramaPage from "@/pages/app/aprendizagem/programa";
import AprendizagemEficaciaPage from "@/pages/app/aprendizagem/eficacia";
import AprendizagemMinhaAreaPage from "@/pages/app/aprendizagem/minha-area";
import AprendizagemEmployeeTrainingsPage from "@/pages/app/aprendizagem/colaboradores/treinamentos";
import AprendizagemTrainingDetailPage from "@/pages/app/aprendizagem/colaboradores/treinamento-detalhe";
import AprendizagemEmployeeDetailPage from "@/pages/app/aprendizagem/colaboradores/[id]";
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
import DocumentContentEditorPage from "@/pages/app/qualidade/documentacao/conteudo";
import SuppliersPage from "@/pages/app/qualidade/fornecedores";
import SupplierCategoriesPage from "@/pages/app/qualidade/fornecedores/categorias";
import SupplierCatalogItemsPage from "@/pages/app/qualidade/fornecedores/catalogo-itens";
import SupplierMasterEditPage from "@/pages/app/qualidade/fornecedores/[id]-cadastro";
import SupplierDetailPage from "@/pages/app/qualidade/fornecedores/[id]";
import SupplierDocumentRequirementsPage from "@/pages/app/qualidade/fornecedores/requisitos-documentais";
import SupplierTypesPage from "@/pages/app/qualidade/fornecedores/tipos";
import RegulatoriosPage from "@/pages/app/qualidade/regulatorios";
import EnvironmentalLaiaPage from "@/pages/app/ambiental/laia";
import EnvironmentalLaiaUnitDetailPage from "@/pages/app/ambiental/laia/unidades/[unitId]";
import KpiModulePage from "@/pages/app/kpi/kpi-module";
import KpiDashboardPage from "@/pages/app/kpi/dashboard";
import KpiLancamentosPage from "@/pages/app/kpi/lancamentos";
import RoadSafetyModulePage from "@/pages/app/road-safety/module";
import ActionPlansListPage from "@/pages/app/planos-acao";
import ActionPlanDetailPage from "@/pages/app/planos-acao/[id]";
import SuasPendenciasPage from "@/pages/app/pendencias";
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

// Cache local apenas para evitar "flash" de tema entre carregamentos.
// A fonte da verdade é a conta (campo `theme` em /auth/me), aplicada por
// ThemeAccountSync; o localStorage é só um espelho gerenciado pelo next-themes.
const THEME_STORAGE_KEY = "daton_theme";

// Reconcilia o tema salvo na conta do usuário com o next-themes.
// Sempre que o tema vindo do servidor muda (ex.: após o login resolver, ou
// após salvar nas configurações), ele é reaplicado — garantindo que a
// preferência persista entre dispositivos, navegadores e limpeza de cache.
function ThemeAccountSync() {
  const { user } = useAuth();
  const { setTheme } = useTheme();
  const serverTheme = user?.theme;

  useEffect(() => {
    if (!serverTheme) return;
    setTheme(serverTheme);
  }, [serverTheme, setTheme]);

  return null;
}

function AppThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      storageKey={THEME_STORAGE_KEY}
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <ThemeAccountSync />
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

function LegacyEmployeesRedirect({ to }: { to: string }) {
  const search = useSearch();
  return <Redirect to={search ? `${to}?${search}` : to} replace />;
}

function AppPages() {
  return (
    <Switch>
      <Route path="/organizacao" component={OrganizacaoOverviewPage} />
      <Route path="/organizacao/colaboradores">
        <LegacyEmployeesRedirect to="/aprendizagem/colaboradores" />
      </Route>
      <Route path="/organizacao/colaboradores/treinamentos">
        <LegacyEmployeesRedirect to="/aprendizagem/colaboradores/treinamentos" />
      </Route>
      <Route path="/organizacao/colaboradores/treinamentos/:title">
        {(params) => (
          <LegacyEmployeesRedirect
            to={`/aprendizagem/colaboradores/treinamentos/${params.title}`}
          />
        )}
      </Route>
      <Route path="/organizacao/colaboradores/:id">
        {(params) => (
          <LegacyEmployeesRedirect
            to={`/aprendizagem/colaboradores/${params.id}`}
          />
        )}
      </Route>
      <Route
        path="/aprendizagem/colaboradores"
        component={AprendizagemEmployeesPage}
      />
      <Route
        path="/aprendizagem/colaboradores/treinamentos"
        component={AprendizagemEmployeeTrainingsPage}
      />
      <Route
        path="/aprendizagem/colaboradores/treinamentos/:title"
        component={AprendizagemTrainingDetailPage}
      />
      <Route
        path="/aprendizagem/colaboradores/:id"
        component={AprendizagemEmployeeDetailPage}
      />
      <Route path="/aprendizagem/catalogo" component={AprendizagemCatalogoPage} />
      <Route path="/aprendizagem/cargos" component={AprendizagemCargosPage} />
      <Route
        path="/aprendizagem/obrigatoriedades"
        component={AprendizagemObrigatoriedadesPage}
      />
      <Route path="/aprendizagem/turmas" component={AprendizagemTurmasPage} />
      <Route path="/aprendizagem/programa" component={AprendizagemProgramaPage} />
      <Route path="/aprendizagem/dashboard" component={AprendizagemDashboardPage} />
      <Route path="/aprendizagem/eficacia" component={AprendizagemEficaciaPage} />
      <Route
        path="/aprendizagem/minha-area"
        component={AprendizagemMinhaAreaPage}
      />
      <Route path="/organizacao/unidades" component={OrganizacaoUnitsPage} />
      <Route path="/organizacao/unidades/:id" component={UnitDetailPage} />
      <Route
        path="/organizacao/departamentos"
        component={OrganizacaoDepartmentsPage}
      />
      <Route path="/organizacao/cargos" component={OrganizacaoPositionsPage} />
      <Route path="/organizacao/swot" component={OrganizacaoSwotPage} />
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
        path="/qualidade/documentacao/:id/conteudo"
        component={DocumentContentEditorPage}
      />
      <Route
        path="/qualidade/documentacao/:id"
        component={DocumentDetailPage}
      />
      <Route path="/qualidade/regulatorios" component={RegulatoriosPage} />
      <Route path="/app/qualidade/regulatorios" component={RegulatoriosPage} />
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
      <Route path="/kpi/indicadores" component={KpiModulePage} />
      <Route path="/kpi/lancamentos">
        <KpiLancamentosPage />
      </Route>
      <Route path="/kpi/dashboard">
        <KpiDashboardPage />
      </Route>
      <Route path="/fatores-desempenho" component={RoadSafetyModulePage} />
      <Route path="/pendencias" component={SuasPendenciasPage} />
      <Route path="/planos-acao/:id" component={ActionPlanDetailPage} />
      <Route path="/planos-acao" component={ActionPlansListPage} />
      <Route path="/configuracoes/perfil" component={ProfileSettingsPage} />
      <Route path="/configuracoes/sistema" component={SystemSettingsPage} />
      <Route path="/app" component={AppIndex} />
      <Route path="/app/organizacao" component={OrganizacaoOverviewPage} />
      <Route path="/app/organizacao/colaboradores">
        <LegacyEmployeesRedirect to="/app/aprendizagem/colaboradores" />
      </Route>
      <Route path="/app/organizacao/colaboradores/treinamentos">
        <LegacyEmployeesRedirect to="/app/aprendizagem/colaboradores/treinamentos" />
      </Route>
      <Route path="/app/organizacao/colaboradores/treinamentos/:title">
        {(params) => (
          <LegacyEmployeesRedirect
            to={`/app/aprendizagem/colaboradores/treinamentos/${params.title}`}
          />
        )}
      </Route>
      <Route path="/app/organizacao/colaboradores/:id">
        {(params) => (
          <LegacyEmployeesRedirect
            to={`/app/aprendizagem/colaboradores/${params.id}`}
          />
        )}
      </Route>
      <Route
        path="/app/aprendizagem/colaboradores"
        component={AprendizagemEmployeesPage}
      />
      <Route
        path="/app/aprendizagem/colaboradores/treinamentos"
        component={AprendizagemEmployeeTrainingsPage}
      />
      <Route
        path="/app/aprendizagem/colaboradores/treinamentos/:title"
        component={AprendizagemTrainingDetailPage}
      />
      <Route
        path="/app/aprendizagem/colaboradores/:id"
        component={AprendizagemEmployeeDetailPage}
      />
      <Route
        path="/app/aprendizagem/catalogo"
        component={AprendizagemCatalogoPage}
      />
      <Route
        path="/app/aprendizagem/cargos"
        component={AprendizagemCargosPage}
      />
      <Route
        path="/app/aprendizagem/obrigatoriedades"
        component={AprendizagemObrigatoriedadesPage}
      />
      <Route
        path="/app/aprendizagem/turmas"
        component={AprendizagemTurmasPage}
      />
      <Route
        path="/app/aprendizagem/programa"
        component={AprendizagemProgramaPage}
      />
      <Route
        path="/app/aprendizagem/dashboard"
        component={AprendizagemDashboardPage}
      />
      <Route
        path="/app/aprendizagem/eficacia"
        component={AprendizagemEficaciaPage}
      />
      <Route
        path="/app/aprendizagem/minha-area"
        component={AprendizagemMinhaAreaPage}
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
      <Route path="/app/organizacao/swot" component={OrganizacaoSwotPage} />
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
        path="/app/qualidade/documentacao/:id/conteudo"
        component={DocumentContentEditorPage}
      />
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
      <Route path="/app/kpi/indicadores" component={KpiModulePage} />
      <Route path="/app/kpi/lancamentos">
        <KpiLancamentosPage />
      </Route>
      <Route path="/app/kpi/dashboard">
        <KpiDashboardPage />
      </Route>
      <Route path="/app/fatores-desempenho" component={RoadSafetyModulePage} />
      <Route path="/app/planos-acao/:id" component={ActionPlanDetailPage} />
      <Route path="/app/planos-acao" component={ActionPlansListPage} />
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
    location.startsWith("/aprendizagem") ||
    location.startsWith("/governanca") ||
    location.startsWith("/qualidade") ||
    location.startsWith("/ambiental") ||
    location.startsWith("/kpi") ||
    location.startsWith("/fatores-desempenho") ||
    location.startsWith("/planos-acao") ||
    location.startsWith("/pendencias") ||
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
      return "/pendencias";
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
        <AppThemeProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </AppThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
