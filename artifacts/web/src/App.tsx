import { useLayoutEffect, useMemo } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";

import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { LayoutProvider } from "@/contexts/LayoutContext";
import { AppLayout } from "@/components/layout/AppLayout";

import AuthPage from "@/pages/auth";
import OnboardingOrganizationPage from "@/pages/onboarding-organizacao";
import AppIndex from "@/pages/app/index";
import OrganizacaoPage from "@/pages/app/organizacao";
import UnitDetailPage from "@/pages/app/organizacao/unidades/[id]";
import GovernancePage from "@/pages/app/governanca";
import GovernanceDetailPage from "@/pages/app/governanca/[id]";
import GovernanceRiskOpportunityPage from "@/pages/app/governanca/riscos-oportunidades";
import ProductKnowledgeAdminPage from "@/pages/app/admin/base-conhecimento";
import LegislacoesPage from "@/pages/app/qualidade/legislacoes";
import LegislationDetailPage from "@/pages/app/qualidade/legislacoes/[id]";
import ColaboradoresPage from "@/pages/app/qualidade/colaboradores";
import ColaboradorDetailPage from "@/pages/app/qualidade/colaboradores/[id]";
import DocumentacaoPage from "@/pages/app/qualidade/documentacao";
import DocumentDetailPage from "@/pages/app/qualidade/documentacao/[id]";
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

function AppPages() {
  return (
    <Switch>
      <Route path="/organizacao" component={OrganizacaoPage} />
      <Route path="/organizacao/unidades" component={OrganizacaoPage} />
      <Route path="/organizacao/unidades/:id" component={UnitDetailPage} />
      <Route path="/governanca/planejamento" component={GovernancePage} />
      <Route path="/governanca/planejamento/:id" component={GovernanceDetailPage} />
      <Route path="/governanca/riscos-oportunidades" component={GovernanceRiskOpportunityPage} />
      <Route path="/admin/base-conhecimento" component={ProductKnowledgeAdminPage} />
      <Route path="/qualidade/legislacoes" component={LegislacoesPage} />
      <Route path="/qualidade/legislacoes/:id" component={LegislationDetailPage} />
      <Route path="/qualidade/colaboradores" component={ColaboradoresPage} />
      <Route path="/qualidade/colaboradores/:id" component={ColaboradorDetailPage} />
      <Route path="/qualidade/documentacao" component={DocumentacaoPage} />
      <Route path="/qualidade/documentacao/:id" component={DocumentDetailPage} />
      <Route path="/app" component={AppIndex} />
      <Route path="/app/organizacao" component={OrganizacaoPage} />
      <Route path="/app/organizacao/unidades" component={OrganizacaoPage} />
      <Route path="/app/organizacao/unidades/:id" component={UnitDetailPage} />
      <Route path="/app/governanca/planejamento" component={GovernancePage} />
      <Route path="/app/governanca/planejamento/:id" component={GovernanceDetailPage} />
      <Route path="/app/governanca/riscos-oportunidades" component={GovernanceRiskOpportunityPage} />
      <Route path="/app/admin/base-conhecimento" component={ProductKnowledgeAdminPage} />
      <Route path="/app/qualidade/legislacoes" component={LegislacoesPage} />
      <Route path="/app/qualidade/legislacoes/:id" component={LegislationDetailPage} />
      <Route path="/app/qualidade/colaboradores" component={ColaboradoresPage} />
      <Route path="/app/qualidade/colaboradores/:id" component={ColaboradorDetailPage} />
      <Route path="/app/qualidade/documentacao" component={DocumentacaoPage} />
      <Route path="/app/qualidade/documentacao/:id" component={DocumentDetailPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function Router() {
  const [location, navigate] = useLocation();
  const { isAuthenticated, isLoading, organization, role } = useAuth();
  const isAppRoute =
    location.startsWith("/app") ||
    location.startsWith("/admin") ||
    location.startsWith("/organizacao") ||
    location.startsWith("/governanca") ||
    location.startsWith("/qualidade");
  const isAuthRoute = location === "/" || location.startsWith("/auth");
  const isOnboardingRoute = location.startsWith("/onboarding/organizacao");
  const onboardingPending = organization?.onboardingStatus === "pending";
  const isPlatformAdmin = role === "platform_admin";
  const redirectTo = useMemo(() => {
    if (isLoading) return null;
    if (!isAuthenticated && (isAppRoute || isOnboardingRoute)) return "/auth";
    if (isAuthenticated && isAuthRoute && isPlatformAdmin) return "/admin/base-conhecimento";
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

  if (isAppRoute) {
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
