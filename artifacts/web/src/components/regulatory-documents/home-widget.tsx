import { Link } from "wouter";
import { AlertTriangle, ArrowRight, CheckCircle2, FileBadge2, ShieldAlert } from "lucide-react";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { useListRegulatoryDocuments } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

/**
 * Compact compliance widget for the home (visão geral) page.
 *
 * Shows totals + the most urgent docs (next 5 closest to expiry). Hidden
 * entirely for orgs without the regulatoryDocuments module — never noisy.
 *
 * Renders 3 states:
 *  1. No module access → null (component hides itself)
 *  2. Module enabled but zero docs → friendly empty CTA
 *  3. Has docs → counters + urgent list
 */
export function RegulatoryHomeWidget() {
  const { organization } = useAuth();
  const { hasModuleAccess } = usePermissions();

  if (!organization || !hasModuleAccess("regulatoryDocuments")) return null;

  return <RegulatoryHomeWidgetInner orgId={organization.id} />;
}

function RegulatoryHomeWidgetInner({ orgId }: { orgId: number }) {
  // The widget needs the full set (counters + urgent shortlist), so we ask
  // for the un-paginated response. The server still returns the standard
  // paginated envelope — we just extract `items`.
  const { data, isLoading } = useListRegulatoryDocuments(orgId, { all: true });
  const docs = data?.items ?? [];

  if (isLoading) {
    return (
      <section>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.12em] mb-5">
          Compliance — Documentos Regulatórios
        </h3>
        <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          Carregando…
        </div>
      </section>
    );
  }

  const total = docs.length;

  // Empty state — friendly CTA, doesn't look broken
  if (total === 0) {
    return (
      <section>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.12em] mb-5">
          Compliance — Documentos Regulatórios
        </h3>
        <div className="rounded-xl border bg-card p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <FileBadge2 className="h-8 w-8 text-muted-foreground/60 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Nenhum documento regulatório cadastrado</p>
              <p className="text-xs text-muted-foreground">
                Cadastre licenças, AVCB, alvarás e demais documentos para acompanhar vencimentos automaticamente.
              </p>
            </div>
          </div>
          <Link href="/qualidade/regulatorios">
            <a className="text-sm font-medium text-primary hover:underline flex items-center gap-1 shrink-0 self-start sm:self-auto">
              Começar
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </Link>
        </div>
      </section>
    );
  }

  const vencidos = docs.filter((d) => d.status === "vencido").length;
  const aVencer = docs.filter((d) => d.status === "a_vencer").length;
  const vigentes = docs.filter((d) => d.status === "vigente").length;

  // Urgent shortlist: vencidos primeiro (mais antigos no topo), depois a_vencer
  // (mais próximos), até 5 itens. Usuário enxerga o que demanda ação agora.
  const urgent = [...docs]
    .filter((d) => d.status !== "vigente")
    .sort((a, b) => {
      // vencido primeiro; dentro do mesmo status, ordena pela validade ascendente
      if (a.status !== b.status) {
        if (a.status === "vencido") return -1;
        if (b.status === "vencido") return 1;
      }
      return a.expirationDate.localeCompare(b.expirationDate);
    })
    .slice(0, 5);

  return (
    <section>
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.12em]">
          Compliance — Documentos Regulatórios
        </h3>
        <Link href="/qualidade/regulatorios">
          <a className="text-xs text-primary hover:underline flex items-center gap-1">
            Ver todos ({total})
            <ArrowRight className="h-3 w-3" />
          </a>
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-[1fr_1fr_1fr_2fr] gap-3">
        <StatTile
          tone="danger"
          icon={<ShieldAlert className="h-4 w-4" />}
          label="Vencidos"
          value={vencidos}
        />
        <StatTile
          tone="warn"
          icon={<AlertTriangle className="h-4 w-4" />}
          label="A vencer"
          value={aVencer}
        />
        <StatTile
          tone="success"
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Vigentes"
          value={vigentes}
        />

        <div className="col-span-2 md:col-span-1 rounded-xl border bg-card p-4 flex flex-col gap-2 min-h-[120px]">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Demanda ação agora
          </p>
          {urgent.length === 0 ? (
            <p className="text-xs text-muted-foreground italic mt-auto mb-auto">
              Tudo vigente — sem urgências.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-xs">
              {urgent.map((d) => (
                <li key={d.id} className="flex items-center gap-2 min-w-0">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full shrink-0",
                      d.status === "vencido" ? "bg-red-500" : "bg-yellow-500",
                    )}
                  />
                  <Link href="/qualidade/regulatorios">
                    <a className="flex-1 truncate hover:underline">
                      <span className="font-medium">{labelForType(d.identifierType)}</span>
                      {d.documentNumber ? ` ${d.documentNumber}` : ""}
                      {d.unitName ? ` · ${d.unitName}` : ""}
                    </a>
                  </Link>
                  <span
                    className={cn(
                      "text-[10px] shrink-0 tabular-nums",
                      d.status === "vencido"
                        ? "text-red-600 dark:text-red-400"
                        : "text-yellow-700 dark:text-yellow-400",
                    )}
                  >
                    {formatUrgency(d.expirationDate, d.status)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function StatTile({
  tone,
  icon,
  label,
  value,
}: {
  tone: "danger" | "warn" | "success";
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  const toneClasses: Record<typeof tone, { border: string; text: string; iconBg: string }> = {
    danger: {
      border: "border-red-200 dark:border-red-500/30",
      text: "text-red-700 dark:text-red-300",
      iconBg: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
    },
    warn: {
      border: "border-yellow-200 dark:border-yellow-500/30",
      text: "text-yellow-700 dark:text-yellow-300",
      iconBg: "bg-yellow-50 text-yellow-600 dark:bg-yellow-500/10 dark:text-yellow-400",
    },
    success: {
      border: "border-green-200 dark:border-green-500/30",
      text: "text-green-700 dark:text-green-300",
      iconBg: "bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-400",
    },
  };
  const t = toneClasses[tone];
  return (
    <div className={cn("rounded-xl border bg-card p-4 flex items-center gap-3 min-h-[120px]", t.border)}>
      <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0", t.iconBg)}>
        {icon}
      </div>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className={cn("text-2xl font-semibold tabular-nums", t.text)}>{value}</span>
      </div>
    </div>
  );
}

const IDENTIFIER_LABELS: Record<string, string> = {
  licenca_ambiental: "Licença",
  avcb: "AVCB",
  alvara: "Alvará",
  outorga: "Outorga",
  certidao: "Certidão",
  outro: "Documento",
};

function labelForType(t: string): string {
  return IDENTIFIER_LABELS[t] ?? "Documento";
}

function formatUrgency(expirationISO: string, status: string): string {
  const [y, m, d] = expirationISO.split("-").map(Number);
  const target = new Date(y, (m ?? 1) - 1, d ?? 1);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (status === "vencido") {
    const absDays = Math.abs(days);
    return absDays === 0 ? "vence hoje" : `vencido há ${absDays}d`;
  }
  return days === 0 ? "vence hoje" : days === 1 ? "1 dia" : `${days} dias`;
}
