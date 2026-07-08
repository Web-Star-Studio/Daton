import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useListOrganizationTrainings,
  getListOrganizationTrainingsQueryKey,
  useListTrainingClasses,
  getListTrainingClassesQueryKey,
  useListTrainingCatalog,
  getListTrainingCatalogQueryKey,
  useListUnits,
  getListUnitsQueryKey,
  useListPositions,
  getListPositionsQueryKey,
} from "@workspace/api-client-react";
import type {
  OrganizationTraining,
  OrganizationTrainingStatus,
  ListOrganizationTrainingsParams,
  ListOrganizationTrainingsStatus,
  TrainingClass,
} from "@workspace/api-client-react";
import { usePageTitle, usePageSubtitle } from "@/contexts/LayoutContext";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Format a date-only ISO string (YYYY-MM-DD) as DD/MM/AA without UTC shift. */
function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const parts = iso.slice(0, 10).split("-");
  if (parts.length === 3) {
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      });
    }
  }
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

/** Vencimento efetivo de um treinamento (expiração, senão prazo). */
function trainingDeadline(t: OrganizationTraining): string | null {
  return t.expirationDate ?? t.dueDate ?? null;
}

// ─── Badges ───────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<OrganizationTrainingStatus, string> = {
  pendente: "bg-blue-50 text-blue-700 border-blue-200",
  concluido: "bg-green-50 text-green-700 border-green-200",
  vencido: "bg-red-50 text-red-700 border-red-200",
};
const STATUS_LABEL: Record<OrganizationTrainingStatus, string> = {
  pendente: "Pendente",
  concluido: "Concluído",
  vencido: "Vencido",
};

const CLASS_STATUS_BADGE: Record<string, string> = {
  agendada: "bg-amber-50 text-amber-700",
  em_andamento: "bg-blue-50 text-blue-700",
  realizada: "bg-green-50 text-green-700",
  cancelada: "bg-muted text-muted-foreground",
};
const CLASS_STATUS_LABEL: Record<string, string> = {
  agendada: "Agendada",
  em_andamento: "Em andamento",
  realizada: "Realizada",
  cancelada: "Cancelada",
};

// ─── Filter / tab types ─────────────────────────────────────────────────────

type StatusFilter = "" | "vencido" | "a_vencer" | "pendente" | "concluido";
type Tab = "colaborador" | "turma" | "prazo";

const TABS: Array<{ value: Tab; label: string }> = [
  { value: "colaborador", label: "Por colaborador" },
  { value: "turma", label: "Por turma" },
  { value: "prazo", label: "Por prazo" },
];

// ─── Page ────────────────────────────────────────────────────────────────

export default function AprendizagemGestaoPage() {
  usePageTitle("Gestão de treinamentos");
  usePageSubtitle("Visão operacional dos treinamentos");

  const { user } = useAuth();
  const orgId = user?.organizationId ?? 0;
  const { hasModuleAccess } = usePermissions();
  const canAccess = hasModuleAccess("employees");
  const enabled = !!orgId && canAccess;

  // ── Filter state ──────────────────────────────────────────────────────────
  const [filial, setFilial] = useState<string>(""); // unitId (string)
  const [cargo, setCargo] = useState<string>(""); // position name
  const [norma, setNorma] = useState<string>(""); // norm
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [tab, setTab] = useState<Tab>("colaborador");
  const [pageSize, setPageSize] = useState(100);

  // ── Filter option data ─────────────────────────────────────────────────────
  const { data: units } = useListUnits(orgId, {
    query: { enabled, queryKey: getListUnitsQueryKey(orgId) },
  });
  const unitList = units ?? [];
  const unitName = useMemo(
    () => new Map(unitList.map((u) => [u.id, u.name])),
    [unitList],
  );

  const { data: positions } = useListPositions(orgId, {
    query: { enabled, queryKey: getListPositionsQueryKey(orgId) },
  });
  const positionList = positions ?? [];

  // ── Shared filter params (sem status) ──────────────────────────────────────
  const baseParams = {
    unitId: filial ? Number(filial) : undefined,
    position: cargo || undefined,
    norm: norma || undefined,
  };

  // ── Query de contagem (metric cards): stats vencido/pendente/concluido ──────
  const countParams: ListOrganizationTrainingsParams = {
    ...baseParams,
    pageSize: 1,
  };
  const { data: countResult } = useListOrganizationTrainings(orgId, countParams, {
    query: {
      enabled,
      queryKey: getListOrganizationTrainingsQueryKey(orgId, countParams),
    },
  });
  const stats = countResult?.stats;

  // ── Query "a vencer em 30 dias": total da paginação ─────────────────────────
  const expiringParams: ListOrganizationTrainingsParams = {
    ...baseParams,
    expiringWithinDays: 30,
    pageSize: 1,
  };
  const { data: expiringResult } = useListOrganizationTrainings(
    orgId,
    expiringParams,
    {
      query: {
        enabled,
        queryKey: getListOrganizationTrainingsQueryKey(orgId, expiringParams),
      },
    },
  );
  const aVencerCount = expiringResult?.pagination.total ?? 0;

  // ── Query principal (Por colaborador / Por prazo) ───────────────────────────
  const isAVencer = statusFilter === "a_vencer";
  const statusParam: ListOrganizationTrainingsStatus | undefined =
    statusFilter === "vencido" ||
    statusFilter === "pendente" ||
    statusFilter === "concluido"
      ? statusFilter
      : undefined;
  const mainParams: ListOrganizationTrainingsParams = {
    ...baseParams,
    status: isAVencer ? undefined : statusParam,
    expiringWithinDays: isAVencer ? 30 : undefined,
    page: 1,
    pageSize,
  };
  const {
    data: mainResult,
    isLoading: mainLoading,
    isError: mainError,
  } = useListOrganizationTrainings(orgId, mainParams, {
    query: {
      enabled: enabled && tab !== "turma",
      queryKey: getListOrganizationTrainingsQueryKey(orgId, mainParams),
    },
  });
  const rows = useMemo(() => mainResult?.data ?? [], [mainResult]);
  const totalRows = mainResult?.pagination.total ?? 0;
  const loadMore = () => setPageSize((n) => n + 100);

  // "Por prazo": mesmas linhas, ordenadas por vencimento asc (nulos por último).
  const rowsByDeadline = useMemo(() => {
    return [...rows].sort((a, b) => {
      const da = trainingDeadline(a);
      const db = trainingDeadline(b);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da.localeCompare(db);
    });
  }, [rows]);

  // ── Query por turma (só quando a aba está ativa) ────────────────────────────
  const classParams = { unitId: filial ? Number(filial) : undefined };
  const {
    data: classResult,
    isLoading: classLoading,
    isError: classError,
  } = useListTrainingClasses(orgId, classParams, {
    query: {
      enabled: enabled && tab === "turma",
      queryKey: getListTrainingClassesQueryKey(orgId, classParams),
    },
  });
  const classes = classResult?.data ?? [];

  // Catálogo sempre carregado: fornece os títulos das turmas E os valores reais
  // de norma para o filtro (rótulos fixos não casariam com o param `norm`).
  const { data: catalogResult } = useListTrainingCatalog(orgId, undefined, {
    query: {
      enabled,
      queryKey: getListTrainingCatalogQueryKey(orgId),
    },
  });
  const catalogTitle = useMemo(
    () => new Map((catalogResult?.data ?? []).map((c) => [c.id, c.title])),
    [catalogResult],
  );
  const normOptions = useMemo(
    () =>
      Array.from(
        new Set(
          (catalogResult?.data ?? [])
            .map((c) => c.norm)
            .filter((n): n is string => !!n),
        ),
      ).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [catalogResult],
  );

  // ── Guards ──────────────────────────────────────────────────────────────
  if (!orgId) return null;

  if (!canAccess) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">
        Você não tem acesso a este módulo.
      </div>
    );
  }

  const toggleStatus = (s: StatusFilter) =>
    setStatusFilter((prev) => (prev === s ? "" : s));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Visão operacional dos treinamentos
      </p>

      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={filial}
          onChange={(e) => setFilial(e.target.value)}
          className="w-auto"
        >
          <option value="">Todas as filiais</option>
          {unitList.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
        <Select
          value={cargo}
          onChange={(e) => setCargo(e.target.value)}
          className="w-auto"
        >
          <option value="">Todos os cargos</option>
          {positionList.map((p) => (
            <option key={p.id} value={p.name}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select
          value={norma}
          onChange={(e) => setNorma(e.target.value)}
          className="w-auto"
        >
          <option value="">Todas as normas</option>
          {normOptions.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Select>
      </div>

      {/* ── Metric cards (clicáveis) ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label="Vencidos"
          value={stats?.vencido ?? 0}
          accent="text-red-700"
          active={statusFilter === "vencido"}
          onClick={() => toggleStatus("vencido")}
        />
        <MetricCard
          label="A vencer em 30 dias"
          value={aVencerCount}
          accent="text-amber-700"
          active={statusFilter === "a_vencer"}
          onClick={() => toggleStatus("a_vencer")}
        />
        <MetricCard
          label="Pendentes"
          value={stats?.pendente ?? 0}
          accent="text-blue-700"
          active={statusFilter === "pendente"}
          onClick={() => toggleStatus("pendente")}
        />
        <MetricCard
          label="Concluídos"
          value={stats?.concluido ?? 0}
          accent="text-green-700"
          active={statusFilter === "concluido"}
          onClick={() => toggleStatus("concluido")}
        />
      </div>

      {/* ── Abas ─────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === t.value
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Conteúdo da aba ──────────────────────────────────────────────── */}
      {tab === "colaborador" ? (
        <div className="rounded-xl border bg-card shadow-sm">
          <TrainingTable
            rows={rows}
            loading={mainLoading}
            error={mainError}
            emptyLabel="Nenhum treinamento encontrado para os filtros selecionados."
          />
          <ResultsFooter shown={rows.length} total={totalRows} onMore={loadMore} />
        </div>
      ) : null}

      {tab === "prazo" ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Ordenado por data de vencimento (mais próximos primeiro).
          </p>
          <div className="rounded-xl border bg-card shadow-sm">
            <TrainingTable
              rows={rowsByDeadline}
              loading={mainLoading}
              error={mainError}
              emptyLabel="Nenhum treinamento encontrado para os filtros selecionados."
            />
            <ResultsFooter
              shown={rowsByDeadline.length}
              total={totalRows}
              onMore={loadMore}
            />
          </div>
        </div>
      ) : null}

      {tab === "turma" ? (
        <div className="rounded-xl border bg-card shadow-sm">
          {classLoading ? (
            <p className="px-4 py-8 text-sm text-muted-foreground">
              Carregando...
            </p>
          ) : classError ? (
            <p className="px-4 py-8 text-center text-sm text-red-600">
              Não foi possível carregar as turmas.
            </p>
          ) : classes.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              Nenhuma turma encontrada para os filtros selecionados.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Turma</th>
                    <th className="px-4 py-2 font-medium">Treinamento</th>
                    <th className="px-4 py-2 font-medium">Data</th>
                    <th className="px-4 py-2 font-medium">Filial</th>
                    <th className="px-4 py-2 font-medium">Inscritos</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {classes.map((c: TrainingClass) => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-2 font-medium">{c.code ?? "—"}</td>
                      <td className="px-4 py-2">
                        {catalogTitle.get(c.catalogItemId) ??
                          `#${c.catalogItemId}`}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {formatDate(c.startDate)}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {c.unitId ? (unitName.get(c.unitId) ?? "—") : "—"}
                      </td>
                      <td className="px-4 py-2">{c.participantCount ?? 0}</td>
                      <td className="px-4 py-2">
                        <Badge className={CLASS_STATUS_BADGE[c.status] ?? ""}>
                          {CLASS_STATUS_LABEL[c.status] ?? c.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Link
                          href="/aprendizagem/turmas"
                          className="text-xs font-medium text-blue-600 hover:underline"
                        >
                          Abrir
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  accent,
  active,
  onClick,
}: {
  label: string;
  value: number;
  accent?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border bg-card p-4 text-left shadow-sm transition-colors hover:bg-muted/40",
        active ? "border-primary ring-2 ring-primary" : "",
      )}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold", accent)}>{value}</div>
    </button>
  );
}

function ResultsFooter({
  shown,
  total,
  onMore,
}: {
  shown: number;
  total: number;
  onMore: () => void;
}) {
  // Só aparece quando há mais registros que os carregados (evita truncar em
  // silêncio em orgs grandes; ver review #139).
  if (total <= shown) return null;
  return (
    <div className="flex items-center justify-between gap-2 border-t px-4 py-2.5 text-xs text-muted-foreground">
      <span>
        Mostrando {shown} de {total}
      </span>
      <button
        type="button"
        onClick={onMore}
        className="font-medium text-blue-600 hover:underline"
      >
        Carregar mais
      </button>
    </div>
  );
}

function TrainingTable({
  rows,
  loading,
  error,
  emptyLabel,
}: {
  rows: OrganizationTraining[];
  loading: boolean;
  error: boolean;
  emptyLabel: string;
}) {
  if (loading) {
    return (
      <p className="px-4 py-8 text-sm text-muted-foreground">Carregando...</p>
    );
  }
  if (error) {
    return (
      <p className="px-4 py-8 text-center text-sm text-red-600">
        Não foi possível carregar os treinamentos.
      </p>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="px-4 py-12 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">Colaborador</th>
            <th className="px-4 py-2 font-medium">Cargo</th>
            <th className="px-4 py-2 font-medium">Filial</th>
            <th className="px-4 py-2 font-medium">Treinamento</th>
            <th className="px-4 py-2 font-medium">Situação</th>
            <th className="px-4 py-2 font-medium">Vencimento</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className="border-b last:border-0 hover:bg-muted/40">
              <td className="px-4 py-2 font-medium">{t.employeeName}</td>
              <td className="px-4 py-2 text-muted-foreground">
                {t.employeePosition ?? "—"}
              </td>
              <td className="px-4 py-2 text-muted-foreground">
                {t.unitName ?? "—"}
              </td>
              <td className="px-4 py-2">{t.title}</td>
              <td className="px-4 py-2">
                <Badge className={cn("border", STATUS_BADGE[t.status])}>
                  {STATUS_LABEL[t.status]}
                </Badge>
              </td>
              <td className="px-4 py-2 text-muted-foreground">
                {formatDate(t.expirationDate ?? t.dueDate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
