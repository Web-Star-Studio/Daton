import React, { useState, useRef } from "react";
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
  Bell,
  Settings
} from "lucide-react";
import { cn } from "@/lib/utils";
import datonLogo from "@assets/daton-logo-header-DC_evyPp_1773347395767.png";
import { ChatPanel } from "@/components/chat/ChatPanel";

function SidebarItem({ 
  href, icon: Icon, label, isOpen, active, hasChildren, onMouseEnter, onMouseLeave 
}: { 
  href: string; icon: React.ElementType; label: string; isOpen: boolean; active: boolean; 
  hasChildren?: boolean; onMouseEnter?: () => void; onMouseLeave?: () => void;
}) {
  return (
    <Link
      href={href}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={cn(
        "relative flex items-center justify-between py-2.5 transition-colors cursor-pointer",
        isOpen ? "px-3" : "px-0 justify-center",
        active 
          ? "text-foreground font-medium" 
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {active && (
        <div className={cn(
          "absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full bg-[#007AFF]",
          isOpen ? "h-6" : "h-5"
        )} />
      )}
      <div className="flex items-center">
        <Icon className={cn("h-[18px] w-[18px] shrink-0", isOpen && "mr-3")} />
        {isOpen && <span className="text-[13px]">{label}</span>}
      </div>
      {isOpen && hasChildren && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />}
    </Link>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isChatOpen, setChatOpen] = useState(false);
  const [qualidadePopover, setQualidadePopover] = useState(false);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });
  const qualidadeRef = useRef<HTMLDivElement>(null);
  const popoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { headerActions, pageTitle, pageSubtitle } = useLayoutState();

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

  const getPageDisplayTitle = (): string => {
    if (location === "/app/organizacao" || location === "/app/organizacao/") return "Organização";
    if (location === "/app/qualidade/legislacoes" || location === "/app/qualidade/legislacoes/") return "Legislações";
    if (location === "/app/qualidade/colaboradores" || location === "/app/qualidade/colaboradores/") return "Colaboradores";
    if (pageTitle) return pageTitle;
    return "";
  };

  const breadcrumbs = getBreadcrumbs();
  const displayTitle = getPageDisplayTitle();

  return (
    <div className="flex h-screen w-full bg-[#f8f8fa] overflow-hidden">
      <aside 
        className={cn(
          "flex flex-col bg-white border-r border-border/40 transition-all duration-300 z-20 shrink-0",
          isSidebarOpen ? "w-[220px]" : "w-16"
        )}
      >
        <div className={cn("h-14 flex items-center justify-center border-b border-border/40")}>
          <img src={datonLogo} alt="Daton" className={cn("object-contain transition-all duration-300", isSidebarOpen ? "h-6" : "h-4")} />
        </div>
        
        <div className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5">
          <SidebarItem
            href="/app/organizacao"
            icon={Building2}
            label="Organização"
            isOpen={isSidebarOpen}
            active={isActive("/app/organizacao")}
          />

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
            <SidebarItem
              href="/app/qualidade/legislacoes"
              icon={Scale}
              label="Qualidade"
              isOpen={isSidebarOpen}
              active={isActive("/app/qualidade")}
              hasChildren
            />
          </div>
        </div>

        <div className="px-3 py-3 border-t border-border/40">
          <div className={cn("flex items-center", isSidebarOpen ? "gap-2.5 justify-between" : "justify-center")}>
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-foreground/5 text-foreground/60 flex items-center justify-center text-xs font-medium shrink-0">
                {user?.name?.charAt(0).toUpperCase() || "U"}
              </div>
              {isSidebarOpen && (
                <span className="text-[13px] text-foreground truncate max-w-[120px]">{user?.name}</span>
              )}
            </div>
            {isSidebarOpen && (
              <button
                onClick={logout}
                className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-foreground hover:bg-secondary/60 transition-colors cursor-pointer"
                title="Sair"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {qualidadePopover && (
        <div
          className="fixed z-[100] min-w-[180px] bg-white border border-border/40 rounded-xl shadow-lg py-2 px-1.5"
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

      <main className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-border/40 sticky top-0 z-10">
          <div className="flex items-center justify-between px-6 h-10">
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setSidebarOpen(!isSidebarOpen)}
                className="p-1 rounded text-muted-foreground/40 hover:text-foreground transition-colors cursor-pointer"
              >
                {isSidebarOpen ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
              </button>
              <nav className="flex items-center text-[12px]">
                {breadcrumbs.map((crumb, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <span className="mx-1.5 text-muted-foreground/30">/</span>}
                    {crumb.href ? (
                      <Link href={crumb.href} className="text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer">
                        {crumb.label}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground/60">
                        {crumb.label}
                      </span>
                    )}
                  </React.Fragment>
                ))}
              </nav>
            </div>
            <div className="flex items-center gap-1.5">
              <button className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-foreground hover:bg-secondary/40 transition-colors cursor-pointer" title="Notificações">
                <Bell className="h-3.5 w-3.5" />
              </button>
              {!isChatOpen && (
                <button
                  onClick={() => setChatOpen(true)}
                  className="p-1.5 rounded-lg transition-colors cursor-pointer text-muted-foreground/40 hover:text-foreground hover:bg-secondary/40"
                  title="Daton AI"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between px-6 pb-4 pt-1">
            <div>
              <h1 className="text-xl font-semibold text-foreground tracking-tight">{displayTitle}</h1>
              {pageSubtitle && (
                <p className="text-[13px] text-muted-foreground mt-0.5">{pageSubtitle}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {headerActions}
            </div>
          </div>
        </header>
        
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>

      {isChatOpen && <ChatPanel isOpen={isChatOpen} onClose={() => setChatOpen(false)} />}
    </div>
  );
}
