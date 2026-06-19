import { useState } from "react";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { usePageSubtitle, usePageTitle } from "@/contexts/LayoutContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
  usePendencias,
  type PendenciasScope,
  ROLE_LABELS,
  formatLastAccess,
  formatRelativeDue,
  groupByPriority,
  URGENCY_META,
  type PendenciasResponse,
  type Pendencia,
} from "@/lib/pendencias-client";
import { useListUnits, getListUnitsQueryKey } from "@workspace/api-client-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";

import { ArrowUpRight, Building2, CalendarDays, CheckCircle2, Clock, List, PartyPopper, ShieldCheck, User } from "lucide-react";
import { PendenciasCalendar } from "@/components/pendencias/PendenciasCalendar";

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

function PendenciaCard({ item, now }: { item: Pendencia; now: Date }) {
  const meta = URGENCY_META[item.urgency];
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={meta.badgeVariant}>{item.sourceLabel}</Badge>
            <span className="text-[12px] text-muted-foreground">
              {formatRelativeDue(item.dueDate, now)} · {item.statusLabel}
            </span>
          </div>
          <p className="mt-1 truncate text-[14px] font-medium text-foreground">{item.title}</p>
          {item.subtitle && (
            <p className="truncate text-[12px] text-muted-foreground">{item.subtitle}</p>
          )}
          {item.responsibleName && (
            <p className="text-[11px] text-muted-foreground">Responsável: {item.responsibleName}</p>
          )}
        </div>
        <Link
          href={item.link.route}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:bg-muted/40"
        >
          {item.link.ctaLabel}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </CardContent>
    </Card>
  );
}

function PrioritySection({
  title,
  priority,
  items,
  now,
}: {
  title: string;
  priority: "P1" | "P2" | "P3";
  items: Pendencia[];
  now: Date;
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-2.5">
      <h2 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
        {title}
        <span className="text-[11px] font-normal text-muted-foreground">
          {priority} · {items.length}
        </span>
      </h2>
      <div className="space-y-2.5">
        {items.map((it) => (
          <PendenciaCard key={it.id} item={it} now={now} />
        ))}
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
        <PartyPopper className="h-8 w-8 text-emerald-500" />
        <p className="text-[15px] font-medium text-foreground">Você está em dia 🎉</p>
        <p className="text-[13px] text-muted-foreground">Nenhuma pendência em aberto no momento.</p>
      </CardContent>
    </Card>
  );
}

export default function SuasPendenciasPage() {
  usePageTitle("Suas pendências");
  usePageSubtitle("Tudo que está sob a sua responsabilidade e precisa de ação");
  const { organization, user: authUser } = useAuth();
  const { isAdmin } = usePermissions();
  const orgId = organization?.id;

  // Scope state — settable by admins via the selector below; operators are always "mine".
  const [scope, setScope] = useState<PendenciasScope>("mine");
  const [unitId, setUnitId] = useState<number | null>(null);
  const [view, setView] = useState<"list" | "calendar">("list");
  const [calMonth, setCalMonth] = useState<Date>(() => new Date());

  const { data: units = [] } = useListUnits(orgId!, {
    query: { queryKey: getListUnitsQueryKey(orgId!), enabled: !!orgId && isAdmin },
  });

  const { data, isLoading, isError } = usePendencias(orgId, { scope, unitId });

  const firstName = (authUser?.name ?? "").trim().split(/\s+/)[0] ?? "";

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-[13px] text-muted-foreground">Olá, {firstName} 👋</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Suas pendências</h1>
      </div>

      {isAdmin && (
        <div className="flex flex-wrap items-center gap-2">
          {(["mine", "unit", "org"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
                scope === s
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {s === "mine" ? "Minhas" : s === "unit" ? "Por filial" : "Organização"}
            </button>
          ))}
          {scope === "unit" && (
            <div className="w-56">
              <SearchableSelect
                value={unitId != null ? String(unitId) : ""}
                onChange={(v) => setUnitId(v ? Number(v) : null)}
                options={units.map((u) => ({ value: String(u.id), label: u.name }))}
                placeholder="Selecione a filial"
              />
            </div>
          )}
        </div>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {isError && (
        <p className="text-sm text-destructive">Não foi possível carregar suas pendências.</p>
      )}

      {scope === "unit" && unitId == null && (
        <p className="text-sm text-muted-foreground">Selecione uma filial para ver as pendências.</p>
      )}

      {data && (
        <>
          <UserIdentityBlock user={data.user} />
          <SummaryCards counts={data.counts} />
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setView("list")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors",
                view === "list" ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <List className="h-3.5 w-3.5" /> Lista
            </button>
            <button
              type="button"
              onClick={() => setView("calendar")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors",
                view === "calendar" ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <CalendarDays className="h-3.5 w-3.5" /> Calendário
            </button>
          </div>
          {view === "list" ? (
            (() => {
              const now = new Date();
              const groups = groupByPriority(data.items);
              const empty = groups.p1.length + groups.p2.length + groups.p3.length === 0;
              if (empty) return <EmptyState />;
              return (
                <div className="space-y-6">
                  <PrioritySection title={URGENCY_META.overdue.sectionTitle} priority="P1" items={groups.p1} now={now} />
                  <PrioritySection title={URGENCY_META.due_soon.sectionTitle} priority="P2" items={groups.p2} now={now} />
                  <PrioritySection title={URGENCY_META.no_due.sectionTitle} priority="P3" items={groups.p3} now={now} />
                </div>
              );
            })()
          ) : (
            <PendenciasCalendar items={data.items} month={calMonth} onMonthChange={setCalMonth} />
          )}
          {data.completedToday.length > 0 && (
            <section className="space-y-2.5">
              <h2 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                Concluídos hoje
                <span className="text-[11px] font-normal text-muted-foreground">
                  {data.completedToday.length}
                </span>
              </h2>
              <div className="space-y-2">
                {data.completedToday.map((it) => (
                  <div
                    key={it.id}
                    className="flex items-center gap-2 rounded-xl border border-border/50 bg-card/30 px-4 py-2.5 opacity-70"
                  >
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    <span className="truncate text-[13px] text-muted-foreground line-through">
                      {it.title}
                    </span>
                    <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                      {it.sourceLabel} · {it.statusLabel}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
