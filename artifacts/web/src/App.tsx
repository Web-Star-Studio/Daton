import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";

// Contexts
import { AuthProvider } from "@/contexts/AuthContext";

// Pages
import AuthPage from "@/pages/auth";
import AppIndex from "@/pages/app/index";
import UnidadesPage from "@/pages/app/organizacao/unidades";
import UnitDetailPage from "@/pages/app/organizacao/unidades/[id]";
import LegislacoesPage from "@/pages/app/qualidade/legislacoes";
import LegislationDetailPage from "@/pages/app/qualidade/legislacoes/[id]";
import ColaboradoresPage from "@/pages/app/qualidade/colaboradores";
import ColaboradorDetailPage from "@/pages/app/qualidade/colaboradores/[id]";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={AuthPage} />
      <Route path="/auth" component={AuthPage} />
      
      {/* App Routes */}
      <Route path="/app" component={AppIndex} />
      <Route path="/app/organizacao/unidades" component={UnidadesPage} />
      <Route path="/app/organizacao/unidades/:id" component={UnitDetailPage} />
      <Route path="/app/qualidade/legislacoes" component={LegislacoesPage} />
      <Route path="/app/qualidade/legislacoes/:id" component={LegislationDetailPage} />
      <Route path="/app/qualidade/colaboradores" component={ColaboradoresPage} />
      <Route path="/app/qualidade/colaboradores/:id" component={ColaboradorDetailPage} />
      
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
