import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { 
  ShieldCheck, 
  Building2, 
  Scale, 
  LogOut, 
  Menu,
  ChevronDown,
  ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, organization, logout } = useAuth();
  const [location] = useLocation();
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isQualidadeOpen, setQualidadeOpen] = useState(true);

  const isActive = (path: string) => location.startsWith(path);

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      {/* Sidebar */}
      <aside 
        className={cn(
          "flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-300 z-20",
          isSidebarOpen ? "w-64" : "w-20"
        )}
      >
        <div className="h-16 flex items-center justify-between px-6 border-b border-sidebar-border">
          {isSidebarOpen && <span className="font-bold text-xl tracking-tight">daton.</span>}
          {!isSidebarOpen && <span className="font-bold text-xl tracking-tight mx-auto">d.</span>}
        </div>
        
        <div className="flex-1 overflow-y-auto py-6 px-3 space-y-6">
          {/* Organização Module */}
          <div className="space-y-1">
            {isSidebarOpen && <h4 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Organização</h4>}
            <Link 
              href="/app/organizacao/unidades"
              className={cn(
                "flex items-center px-3 py-2 rounded-lg transition-colors group text-sm font-medium",
                isActive("/app/organizacao/unidades") 
                  ? "bg-primary/10 text-primary" 
                  : "text-sidebar-foreground hover:bg-sidebar-accent"
              )}
            >
              <Building2 className="h-5 w-5 mr-3 shrink-0" />
              {isSidebarOpen && <span>Unidades</span>}
            </Link>
          </div>

          {/* Qualidade Module */}
          <div className="space-y-1">
            {isSidebarOpen && <h4 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Módulos</h4>}
            
            <button 
              onClick={() => setQualidadeOpen(!isQualidadeOpen)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors text-sm font-medium"
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
                    "flex items-center px-3 py-2 rounded-lg transition-colors text-sm font-medium",
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
            className="flex items-center w-full px-3 py-2 text-sm font-medium text-muted-foreground rounded-lg hover:bg-sidebar-accent hover:text-destructive transition-colors"
          >
            <LogOut className="h-5 w-5 mr-3" />
            {isSidebarOpen && <span>Sair</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 flex items-center justify-between px-8 border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center">
            <button 
              onClick={() => setSidebarOpen(!isSidebarOpen)}
              className="p-2 -ml-2 mr-4 rounded-lg hover:bg-accent text-muted-foreground transition-colors"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-semibold">{organization?.name || "Daton Workspace"}</h1>
          </div>
          <div className="flex items-center space-x-4">
            <div className="h-8 w-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm">
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
