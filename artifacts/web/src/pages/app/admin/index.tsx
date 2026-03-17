import { Link } from "wouter";
import { BookText, LayoutDashboard } from "lucide-react";
import { usePageTitle } from "@/contexts/LayoutContext";

const adminModules = [
  {
    href: "/admin/base-conhecimento",
    label: "Base de Conhecimento",
    description:
      "Artigos da knowledge base global usada pelo Daton AI para responder dúvidas sobre fluxos, módulos e funcionamento.",
    icon: BookText,
  },
];

export default function AdminDashboardPage() {
  usePageTitle("Painel Administrativo");

  return (
    <div className="px-6 py-6 space-y-10">
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.12em] mb-5">
          Módulos
        </h3>

        {adminModules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <LayoutDashboard className="h-9 w-9 text-muted-foreground/40" />
            <h2 className="mt-4 text-lg font-semibold text-foreground">
              Nenhum módulo disponível
            </h2>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              Os módulos de administração aparecerão aqui quando configurados.
            </p>
          </div>
        ) : (
          <div className="space-y-px">
            {adminModules.map((mod) => (
              <Link
                key={mod.href}
                href={mod.href}
                className="group flex items-center justify-between gap-4 py-4 border-b border-border/40 hover:bg-muted/20 -mx-2 px-2 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-muted/40 group-hover:bg-muted/60 transition-colors">
                    <mod.icon className="h-[18px] w-[18px] text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                  <div>
                    <p className="text-[14px] font-medium text-foreground">
                      {mod.label}
                    </p>
                    <p className="mt-0.5 text-[13px] text-muted-foreground leading-relaxed">
                      {mod.description}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
