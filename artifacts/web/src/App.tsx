import { useLayoutEffect, useMemo } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import OrganizacaoEmployeeDetailPage from "@/pages/app/organizacao/colaboradores/[id]";
import UnitDetailPage from "@/pages/app/organizacao/unidades/[id]";
import GovernancePage from "@/pages/app/governanca";
import GovernanceDetailPage from "@/pages/app/governanca/[id]";
import GovernanceRiskOpportunityPage from "@/pages/app/governanca/riscos-oportunidades";
import AdminDashboardPage from "@/pages/app/admin/index";
import ProductKnowledgeAdminPage from "@/pages/app/admin/base-conhecimento";
import LegislacoesPage from "@/pages/app/qualidade/legislacoes";
import LegislationDetailPage from "@/pages/app/qualidade/legislacoes/[id]";
import DocumentacaoPage from "@/pages/app/qualidade/documentacao";
import DocumentDetailPage from "@/pages/app/qualidade/documentacao/[id]";
import ProfileSettingsPage from "@/pages/app/configuracoes/perfil";
import SystemSettingsPage from "@/pages/app/configuracoes/sistema";
import AcceptInvitePage from "@/pages/accept-invite";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AdminPages() {
  return (
    <Switch>
      <Route path="/admin" component={AdminDashboardPage} />
      <Route path="/admin/base-conhecimento" component={ProductKnowledgeAdminPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppPages() {
  return (
    <Switch>
      <Route path="/organizacao" component={OrganizacaoOverviewPage} />
      <Route path="/organizacao/colaboradores" component={OrganizacaoEmployeesPage} />
      <Route path="/organizacao/colaboradores/:id" component={OrganizacaoEmployeeDetailPage} />
      <Route path="/organizacao/unidades" component={OrganizacaoUnitsPage} />
      <Route path="/organizacao/unidades/:id" component={UnitDetailPage} />
      <Route path="/organizacao/departamentos" component={OrganizacaoDepartmentsPage} />
      <Route path="/organizacao/cargos" component={OrganizacaoPositionsPage} />
      <Route path="/governanca/planejamento" component={GovernancePage} />
      <Route path="/governanca/planejamento/:id" component={GovernanceDetailPage} />
      <Route path="/governanca/riscos-oportunidades" component={GovernanceRiskOpportunityPage} />
      <Route path="/qualidade/legislacoes" component={LegislacoesPage} />
      <Route path="/qualidade/legislacoes/:id" component={LegislationDetailPage} />
      <Route path="/qualidade/documentacao" component={DocumentacaoPage} />
      <Route path="/qualidade/documentacao/:id" component={DocumentDetailPage} />
      <Route path="/configuracoes/perfil" component={ProfileSettingsPage} />
      <Route path="/configuracoes/sistema" component={SystemSettingsPage} />
      <Route path="/app" component={AppIndex} />
      <Route path="/app/organizacao" component={OrganizacaoOverviewPage} />
      <Route path="/app/organizacao/colaboradores" component={OrganizacaoEmployeesPage} />
      <Route path="/app/organizacao/colaboradores/:id" component={OrganizacaoEmployeeDetailPage} />
      <Route path="/app/organizacao/unidades" component={OrganizacaoUnitsPage} />
      <Route path="/app/organizacao/unidades/:id" component={UnitDetailPage} />
      <Route path="/app/organizacao/departamentos" component={OrganizacaoDepartmentsPage} />
      <Route path="/app/organizacao/cargos" component={OrganizacaoPositionsPage} />
      <Route path="/app/governanca/planejamento" component={GovernancePage} />
      <Route path="/app/governanca/planejamento/:id" component={GovernanceDetailPage} />
      <Route path="/app/governanca/riscos-oportunidades" component={GovernanceRiskOpportunityPage} />
      <Route path="/app/qualidade/legislacoes" component={LegislacoesPage} />
      <Route path="/app/qualidade/legislacoes/:id" component={LegislationDetailPage} />
      <Route path="/app/qualidade/documentacao" component={DocumentacaoPage} />
      <Route path="/app/qualidade/documentacao/:id" component={DocumentDetailPage} />
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
    if (isAuthenticated && onboardingPending && !isOnboardingRoute && !isPlatformAdmin) {
      return "/onboarding/organizacao";
    }
    if (isAuthenticated && !onboardingPending && (isOnboardingRoute || isAuthRoute)) return "/organizacao";
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
      <Route path="/onboarding/organizacao" component={OnboardingOrganizationPage} />
      <Route path="/convite/:token" component={AcceptInvitePage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
