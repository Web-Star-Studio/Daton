import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useLayoutState } from "@/contexts/LayoutContext";
import {
  LayoutDashboard,
  BookText,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Bell,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { NotificationsPanel } from "@/components/notifications/NotificationsPanel";

const datonLogo = "/images/daton-logo.png";

const adminNavItems = [
  { href: "/admin", label: "Painel", icon: LayoutDashboard, exact: true },
  { href: "/admin/base-conhecimento", label: "Base de Conhecimento", icon: BookText },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isChatOpen, setChatOpen] = useState(false);
  const [isNotificationsOpen, setNotificationsOpen] = useState(false);
  const { headerActions } = useLayoutState();

  const isActive = (path: string, exact?: boolean) =>
    exact ? location === path : location.startsWith(path);

  const getBreadcrumbs = (): { label: string; href?: string }[] => {
    const crumbs: { label: string; href?: string }[] = [{ label: "Admin", href: "/admin" }];

    if (location.startsWith("/admin/base-conhecimento")) {
      crumbs.push({ label: "Base de Conhecimento" });
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
        <div className="h-14 flex items-center justify-center">
          <img
            src={datonLogo}
            alt="Daton"
            className={cn(
              "object-contain transition-all duration-300",
              isSidebarOpen ? "h-6" : "h-4"
            )}
          />
        </div>

        <div className="flex-1 overflow-y-auto py-5 px-2.5 space-y-1">
          {adminNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center px-2.5 py-2 rounded-lg transition-colors text-[13px] cursor-pointer",
                isActive(item.href, item.exact)
                  ? "text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon
                className={cn("h-[18px] w-[18px] shrink-0", isSidebarOpen && "mr-2.5")}
              />
              {isSidebarOpen && <span>{item.label}</span>}
            </Link>
          ))}
        </div>

        <div className="px-2.5 py-3">
          <div
            className={cn(
              "flex items-center",
              isSidebarOpen ? "gap-2 justify-between" : "justify-center"
            )}
          >
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-foreground/5 text-foreground/60 flex items-center justify-center text-xs font-medium shrink-0">
                {user?.name?.charAt(0).toUpperCase() || "U"}
              </div>
              {isSidebarOpen && (
                <span className="text-[13px] text-muted-foreground truncate">
                  {user?.name}
                </span>
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
              {isSidebarOpen ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <PanelLeftOpen className="h-4 w-4" />
              )}
            </button>
            <nav className="flex items-center text-[13px]">
              {breadcrumbs.map((crumb, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span className="mx-2 text-muted-foreground/40">/</span>}
                  {crumb.href && i < breadcrumbs.length - 1 ? (
                    <Link
                      href={crumb.href}
                      className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span
                      className={
                        i === breadcrumbs.length - 1
                          ? "text-foreground"
                          : "text-muted-foreground"
                      }
                    >
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

      <ChatPanel isOpen={isChatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}
