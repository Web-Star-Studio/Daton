import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useLayoutState } from "@/contexts/LayoutContext";
import { 
  Building2, 
  Scale, 
  LogOut, 
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  ChevronRight,
  Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";
import datonLogo from "@assets/daton-logo-header-DC_evyPp_1773347395767.png";
import { ChatPanel } from "@/components/chat/ChatPanel";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isQualidadeOpen, setQualidadeOpen] = useState(true);
  const [isChatOpen, setChatOpen] = useState(false);
  const { headerActions, pageTitle } = useLayoutState();

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
      } else if (location.startsWith("/app/qualidade/colaboradores")) {
        crumbs.push({ label: "Colaboradores", href: "/app/qualidade/colaboradores" });
        if (pageTitle && location !== "/app/qualidade/colaboradores") {
          crumbs.push({ label: pageTitle });
        }
      }
    } else if (location.startsWith("/app/organizacao")) {
      crumbs.push({ label: "Organização", href: "/app/organizacao" });
      if (location.startsWith("/app/organizacao/unidades/") && pageTitle) {
        crumbs.push({ label: pageTitle });
      }
    }

    return crumbs;
  };

  const breadcrumbs = getBreadcrumbs();

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      <aside 
        className={cn(
          "flex flex-col bg-white border-r border-border/60 transition-all duration-300 z-20",
          isSidebarOpen ? "w-60" : "w-16"
        )}
      >
        <div className={cn("h-14 flex items-center justify-center border-b border-border/60")}>
          <img src={datonLogo} alt="Daton" className={cn("object-contain", isSidebarOpen ? "h-6" : "h-5")} />
        </div>
        
        <div className="flex-1 overflow-y-auto py-5 px-2.5 space-y-1">
          <Link 
            href="/app/organizacao"
            className={cn(
              "flex items-center px-2.5 py-2 rounded-lg transition-colors text-[13px] cursor-pointer",
              isActive("/app/organizacao") 
                ? "text-foreground font-medium" 
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Building2 className={cn("h-[18px] w-[18px] shrink-0", isSidebarOpen && "mr-2.5")} />
            {isSidebarOpen && <span>Organização</span>}
          </Link>

          <button 
            onClick={() => setQualidadeOpen(!isQualidadeOpen)}
            className={cn(
              "w-full flex items-center justify-between px-2.5 py-2 rounded-lg transition-colors text-[13px] cursor-pointer",
              isActive("/app/qualidade")
                ? "text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <div className="flex items-center">
              <Scale className={cn("h-[18px] w-[18px] shrink-0", isSidebarOpen && "mr-2.5")} />
              {isSidebarOpen && <span>Qualidade</span>}
            </div>
            {isSidebarOpen && (isQualidadeOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/50" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />)}
          </button>
          
          {isSidebarOpen && isQualidadeOpen && (
            <>
              <Link 
                href="/app/qualidade/legislacoes"
                className={cn(
                  "flex items-center pl-[38px] pr-2.5 py-1.5 rounded-lg transition-colors text-[13px] cursor-pointer",
                  isActive("/app/qualidade/legislacoes")
                    ? "text-foreground font-medium" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Legislações
              </Link>
              <Link 
                href="/app/qualidade/colaboradores"
                className={cn(
                  "flex items-center pl-[38px] pr-2.5 py-1.5 rounded-lg transition-colors text-[13px] cursor-pointer",
                  isActive("/app/qualidade/colaboradores")
                    ? "text-foreground font-medium" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Colaboradores
              </Link>
            </>
          )}
        </div>

        <div className="px-2.5 py-3 border-t border-border/60">
          <div className={cn("flex items-center", isSidebarOpen ? "gap-2 justify-between" : "justify-center")}>
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-foreground/5 text-foreground/60 flex items-center justify-center text-xs font-medium shrink-0">
                {user?.name?.charAt(0).toUpperCase() || "U"}
              </div>
              {isSidebarOpen && (
                <span className="text-[13px] text-muted-foreground truncate">{user?.name}</span>
              )}
            </div>
            {isSidebarOpen && (
              <button
                onClick={logout}
                className="p-1.5 rounded text-muted-foreground/50 hover:text-foreground transition-colors cursor-pointer"
                title="Sair"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 flex items-center justify-between px-6 border-b border-border/60 bg-white sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!isSidebarOpen)}
              className="p-1.5 rounded text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
            >
              {isSidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
            </button>
            <nav className="flex items-center text-[13px]">
              {breadcrumbs.map((crumb, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span className="mx-2 text-muted-foreground/40">/</span>}
                  {crumb.href ? (
                    <Link href={crumb.href} className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className={i === breadcrumbs.length - 1 ? "text-foreground" : "text-muted-foreground"}>
                      {crumb.label}
                    </span>
                  )}
                </React.Fragment>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {headerActions}
            <button
              onClick={() => setChatOpen(!isChatOpen)}
              className={`p-2 rounded-lg transition-colors cursor-pointer ${
                isChatOpen
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground/60 hover:text-foreground hover:bg-secondary/60"
              }`}
              title="Daton AI"
            >
              <Sparkles className="h-4 w-4" />
            </button>
          </div>
        </header>
        
        <div className="flex-1 overflow-auto p-8">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>

      {isChatOpen && <ChatPanel isOpen={isChatOpen} onClose={() => setChatOpen(false)} />}
    </div>
  );
}
