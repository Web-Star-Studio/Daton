import React, { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useLayoutState } from "@/contexts/LayoutContext";
import { 
  Building2, 
  Scale, 
  LogOut, 
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight,
  Sparkles,
  Bell
} from "lucide-react";
import { cn } from "@/lib/utils";
import datonLogo from "@assets/daton-logo-header-DC_evyPp_1773347395767.png";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { NotificationsPanel } from "@/components/notifications/NotificationsPanel";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isChatOpen, setChatOpen] = useState(false);
  const [isNotificationsOpen, setNotificationsOpen] = useState(false);
  const [qualidadePopover, setQualidadePopover] = useState(false);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });
  const qualidadeRef = useRef<HTMLDivElement>(null);
  const popoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    <div className="flex h-screen w-full bg-background overflow-hidden p-2.5 gap-2.5">
      <aside 
        className={cn(
          "flex flex-col bg-white rounded-2xl border border-border/60 shadow-sm transition-all duration-300 z-20 shrink-0",
          isSidebarOpen ? "w-[228px]" : "w-14"
        )}
      >
        <div className={cn("h-14 flex items-center justify-center")}>
          <img src={datonLogo} alt="Daton" className={cn("object-contain transition-all duration-300", isSidebarOpen ? "h-6" : "h-4")} />
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

          <div
            ref={qualidadeRef}
            onMouseEnter={() => {
              if (popoverTimeoutRef.current) clearTimeout(popoverTimeoutRef.current);
              if (qualidadeRef.current) {
                const rect = qualidadeRef.current.getBoundingClientRect();
                setPopoverPos({ top: rect.top, left: rect.right + 6 });
              }
              setQualidadePopover(true);
            }}
            onMouseLeave={() => {
              popoverTimeoutRef.current = setTimeout(() => setQualidadePopover(false), 150);
            }}
          >
            <Link
              href="/app/qualidade/legislacoes"
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
              {isSidebarOpen && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />}
            </Link>
          </div>

          {qualidadePopover && (
            <div
              className="fixed z-[100] min-w-[180px] bg-white border border-border/60 rounded-xl shadow-lg py-2 px-1.5 animate-[popoverIn_150ms_cubic-bezier(0.16,1,0.3,1)]"
              style={{ top: popoverPos.top, left: popoverPos.left }}
              onMouseEnter={() => {
                if (popoverTimeoutRef.current) clearTimeout(popoverTimeoutRef.current);
              }}
              onMouseLeave={() => {
                popoverTimeoutRef.current = setTimeout(() => setQualidadePopover(false), 150);
              }}
            >
              <p className="px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Qualidade</p>
              <Link
                href="/app/qualidade/legislacoes"
                onClick={() => setQualidadePopover(false)}
                className={cn(
                  "flex items-center px-2.5 py-2 rounded-lg transition-colors text-[13px] cursor-pointer",
                  isActive("/app/qualidade/legislacoes")
                    ? "text-foreground font-medium bg-muted/50"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                )}
              >
                Legislações
              </Link>
              <Link
                href="/app/qualidade/colaboradores"
                onClick={() => setQualidadePopover(false)}
                className={cn(
                  "flex items-center px-2.5 py-2 rounded-lg transition-colors text-[13px] cursor-pointer",
                  isActive("/app/qualidade/colaboradores")
                    ? "text-foreground font-medium bg-muted/50"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                )}
              >
                Colaboradores
              </Link>
            </div>
          )}
        </div>

        <div className="px-2.5 py-3">
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

      <main className="flex-1 flex flex-col min-w-0 bg-white rounded-2xl border border-border/60 shadow-sm overflow-hidden">
        <header className="h-14 flex items-center justify-between px-6 border-b border-border/40 sticky top-0 z-10">
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
              onClick={() => setNotificationsOpen(!isNotificationsOpen)}
              className="p-2 rounded-lg transition-colors cursor-pointer relative text-muted-foreground/60 hover:text-foreground hover:bg-secondary/60"
              title="Notificações"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold leading-none">
                3
              </span>
            </button>
            {isNotificationsOpen && (
              <NotificationsPanel onClose={() => setNotificationsOpen(false)} />
            )}
            {!isChatOpen && (
              <button
                onClick={() => setChatOpen(true)}
                className="p-2 rounded-lg transition-colors cursor-pointer text-muted-foreground/60 hover:text-foreground hover:bg-secondary/60"
                title="Daton AI"
              >
                <Sparkles className="h-4 w-4" />
              </button>
            )}
          </div>
        </header>
        
        <div className="flex-1 overflow-auto p-8">
          <div key={location} className="max-w-6xl mx-auto animate-fade-in-up">
            {children}
          </div>
        </div>
      </main>

      {isChatOpen && <ChatPanel isOpen={isChatOpen} onClose={() => setChatOpen(false)} />}
    </div>
  );
}
