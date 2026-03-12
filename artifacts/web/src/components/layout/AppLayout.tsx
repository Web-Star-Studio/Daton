import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { 
  ShieldCheck, 
  Building2, 
  Scale, 
  LogOut, 
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import datonLogo from "@assets/daton-logo-header-DC_evyPp_1773347395767.png";

interface AppLayoutProps {
  children: React.ReactNode;
  pageTitle?: string;
  headerActions?: React.ReactNode;
}

export function AppLayout({ children, pageTitle, headerActions }: AppLayoutProps) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isQualidadeOpen, setQualidadeOpen] = useState(true);

  const isActive = (path: string) => location.startsWith(path);

  const getBreadcrumbs = (): { label: string; href?: string }[] => {
    const crumbs: { label: string; href?: string }[] = [];

    if (location.startsWith("/app/qualidade")) {
      crumbs.push({ label: "Qualidade" });
      if (location.startsWith("/app/qualidade/legislacoes")) {
        crumbs.push({ label: "Legislações", href: "/app/qualidade/legislacoes" });
        if (pageTitle && location !== "/app/qualidade/legislacoes") {
          crumbs.push({ label: pageTitle });
        }
      }
    } else if (location.startsWith("/app/organizacao")) {
      crumbs.push({ label: "Organização" });
      if (location.startsWith("/app/organizacao/unidades")) {
        crumbs.push({ label: "Unidades" });
      }
    }

    return crumbs;
  };

  const breadcrumbs = getBreadcrumbs();

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      <aside 
        className={cn(
          "flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-300 z-20",
          isSidebarOpen ? "w-64" : "w-20"
        )}
      >
        <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border">
          {isSidebarOpen ? (
            <img src={datonLogo} alt="Daton" className="h-7 object-contain" />
          ) : (
            <img src={datonLogo} alt="Daton" className="h-6 object-contain mx-auto" />
          )}
          <button
            onClick={() => setSidebarOpen(!isSidebarOpen)}
            className={cn(
              "p-1.5 rounded-lg text-muted-foreground hover:bg-sidebar-accent transition-colors cursor-pointer",
              !isSidebarOpen && "mx-auto mt-0"
            )}
          >
            {isSidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto py-6 px-3 space-y-6">
          <div className="space-y-1">
            {isSidebarOpen && <h4 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Organização</h4>}
            <Link 
              href="/app/organizacao/unidades"
              className={cn(
                "flex items-center px-3 py-2 rounded-lg transition-colors group text-sm font-medium cursor-pointer",
                isActive("/app/organizacao/unidades") 
                  ? "bg-primary/10 text-primary" 
                  : "text-sidebar-foreground hover:bg-sidebar-accent"
              )}
            >
              <Building2 className="h-5 w-5 mr-3 shrink-0" />
              {isSidebarOpen && <span>Unidades</span>}
            </Link>
          </div>

          <div className="space-y-1">
            {isSidebarOpen && <h4 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Módulos</h4>}
            
            <button 
              onClick={() => setQualidadeOpen(!isQualidadeOpen)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors text-sm font-medium cursor-pointer"
            >
              <div className="flex items-center">
                <ShieldCheck className="h-5 w-5 mr-3 shrink-0" />
                {isSidebarOpen && <span>Qualidade</span>}
              </div>
              {isSidebarOpen && (isQualidadeOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
            </button>
            
            {isSidebarOpen && isQualidadeOpen && (
              <div className="pl-10 pr-3 pt-1 space-y-1">
                <Link 
                  href="/app/qualidade/legislacoes"
                  className={cn(
                    "flex items-center px-3 py-2 rounded-lg transition-colors text-sm font-medium cursor-pointer",
                    isActive("/app/qualidade/legislacoes")
                      ? "bg-primary/10 text-primary" 
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                >
                  <Scale className="h-4 w-4 mr-2" />
                  Legislações
                </Link>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-sidebar-border">
          <button 
            onClick={logout}
            className="flex items-center w-full px-3 py-2 text-sm font-medium text-muted-foreground rounded-lg hover:bg-sidebar-accent hover:text-destructive transition-colors cursor-pointer"
          >
            <LogOut className="h-5 w-5 mr-3" />
            {isSidebarOpen && <span>Sair</span>}
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 flex items-center justify-between px-8 border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-10">
          <nav className="flex items-center text-sm">
            {breadcrumbs.map((crumb, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="mx-2 text-muted-foreground/50">/</span>}
                {crumb.href ? (
                  <Link href={crumb.href} className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className={i === breadcrumbs.length - 1 ? "font-medium text-foreground" : "text-muted-foreground"}>
                    {crumb.label}
                  </span>
                )}
              </React.Fragment>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            {headerActions}
            <div className="h-8 w-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm cursor-pointer">
              {user?.name?.charAt(0).toUpperCase() || "U"}
            </div>
          </div>
        </header>
        
        <div className="flex-1 overflow-auto p-8 bg-background/50">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
