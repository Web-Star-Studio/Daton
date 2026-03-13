import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";

import { AuthProvider } from "@/contexts/AuthContext";
import { LayoutProvider } from "@/contexts/LayoutContext";
import { AppLayout } from "@/components/layout/AppLayout";

import AuthPage from "@/pages/auth";
import AppIndex from "@/pages/app/index";
import OrganizacaoPage from "@/pages/app/organizacao";
import UnitDetailPage from "@/pages/app/organizacao/unidades/[id]";
import LegislacoesPage from "@/pages/app/qualidade/legislacoes";
import LegislationDetailPage from "@/pages/app/qualidade/legislacoes/[id]";
import ColaboradoresPage from "@/pages/app/qualidade/colaboradores";
import ColaboradorDetailPage from "@/pages/app/qualidade/colaboradores/[id]";
import DocumentacaoPage from "@/pages/app/qualidade/documentacao";
import NovoDocumentoPage from "@/pages/app/qualidade/documentacao/novo";
import DocumentDetailPage from "@/pages/app/qualidade/documentacao/[id]";
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
      <Route path="/app" component={AppIndex} />
      <Route path="/app/organizacao" component={OrganizacaoPage} />
      <Route path="/app/organizacao/unidades" component={OrganizacaoPage} />
      <Route path="/app/organizacao/unidades/:id" component={UnitDetailPage} />
      <Route path="/app/qualidade/legislacoes" component={LegislacoesPage} />
      <Route path="/app/qualidade/legislacoes/:id" component={LegislationDetailPage} />
      <Route path="/app/qualidade/colaboradores" component={ColaboradoresPage} />
      <Route path="/app/qualidade/colaboradores/:id" component={ColaboradorDetailPage} />
      <Route path="/app/qualidade/documentacao" component={DocumentacaoPage} />
      <Route path="/app/qualidade/documentacao/novo" component={NovoDocumentoPage} />
      <Route path="/app/qualidade/documentacao/:id" component={DocumentDetailPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function Router() {
  const [location] = useLocation();
  const isAppRoute = location.startsWith("/app");

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
