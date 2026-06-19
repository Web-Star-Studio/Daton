import { useState } from "react";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { usePageSubtitle, usePageTitle } from "@/contexts/LayoutContext";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  usePendencias,
  type PendenciasScope,
  ROLE_LABELS,
  formatLastAccess,
  type PendenciasResponse,
} from "@/lib/pendencias-client";
import { Building2, Clock, ShieldCheck, User } from "lucide-react";

function UserIdentityBlock({ user }: { user: PendenciasResponse["user"] }) {
  const now = new Date();
  const fields: { icon: typeof User; label: string; value: string }[] = [
    { icon: User, label: "Nome", value: user.name },
    { icon: Building2, label: "Filial", value: user.filial?.name ?? "—" },
    { icon: ShieldCheck, label: "Perfil", value: ROLE_LABELS[user.role] ?? user.role },
    { icon: Clock, label: "Último acesso", value: formatLastAccess(user.lastLoginAt, now) },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {fields.map((f) => (
        <div key={f.label} className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-card/40 px-3 py-2.5">
          <f.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{f.label}</p>
            <p className="truncate text-[13px] font-medium text-foreground">{f.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function SummaryCards({ counts }: { counts: PendenciasResponse["counts"] }) {
  const cards: { label: string; value: number; hint: string }[] = [
    { label: "Total em aberto", value: counts.total, hint: `${counts.overdue} vencido(s)` },
    { label: "Indicadores", value: counts.bySource.kpi, hint: "para alimentar" },
    { label: "Planos de ação", value: counts.bySource.action_plan, hint: "em andamento" },
    { label: "Não conformidades", value: counts.bySource.nonconformity, hint: "aguardam ação" },
    { label: "Documentos", value: counts.bySource.regulatory_document, hint: "a renovar" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{c.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{c.value}</p>
            <p className="text-[11px] text-muted-foreground">{c.hint}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function SuasPendenciasPage() {
  usePageTitle("Suas pendências");
  usePageSubtitle("Tudo que está sob a sua responsabilidade e precisa de ação");
  const { organization, user: authUser } = useAuth();
  const { isAdmin } = usePermissions();
  const orgId = organization?.id;

  // Scope state (the selector itself is added in Task 6; operators are always "mine").
  const [scope] = useState<PendenciasScope>("mine");
  const [unitId] = useState<number | null>(null);

  const { data, isLoading, isError } = usePendencias(orgId, { scope, unitId });

  const firstName = (authUser?.name ?? "").trim().split(/\s+/)[0] ?? "";

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-[13px] text-muted-foreground">Olá, {firstName} 👋</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Suas pendências</h1>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {isError && (
        <p className="text-sm text-destructive">Não foi possível carregar suas pendências.</p>
      )}

      {data && (
        <>
          <UserIdentityBlock user={data.user} />
          <SummaryCards counts={data.counts} />
          {/* Priority list (Task 5) and scope selector (Task 6) render here. */}
          <div data-testid="pendencias-list" className={cn(isAdmin && "scroll-mt-4")} />
        </>
      )}
    </div>
  );
}
