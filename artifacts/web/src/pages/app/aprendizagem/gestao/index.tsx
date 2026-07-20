import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  useListOrganizationTrainings,
  getListOrganizationTrainingsQueryKey,
  useListTrainingClasses,
  getListTrainingClassesQueryKey,
  useListUnits,
  getListUnitsQueryKey,
  useListPositions,
  getListPositionsQueryKey,
  useListTrainingRequirements,
  getListTrainingRequirementsQueryKey,
} from "@workspace/api-client-react";
import type { OrganizationTraining } from "@workspace/api-client-react";
import { useAllTrainingCatalog } from "@/lib/training-catalog-client";
import {
  useActiveNorms,
  useAllNorms,
  buildNormLabelMap,
} from "@/lib/norms-client";
import type { ListOrganizationTrainingsParams } from "@workspace/api-client-react";
import { usePageTitle, usePageSubtitle } from "@/contexts/LayoutContext";
import { useAuth, usePermissions } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";
import { formatDate, trainingDeadline } from "./_lib/format";
import { buildCatalogMeta } from "./_lib/catalog-meta";
import {
  buildColaboradorRows,
  buildTurmaRows,
  exportGestaoXlsx,
} from "./_export";
import { PorColaboradorTable } from "./_components/PorColaboradorTable";
import { PorTurmaTable } from "./_components/PorTurmaTable";
import { MetricCards, type CardStatusFilter } from "./_components/MetricCards";
import { StatusPills } from "./_components/StatusPills";
import { PorPrazoPanel, type PrazoItem } from "./_components/PorPrazoPanel";

/** Mapeia um treinamento para o item compacto exibido no painel "Por prazo". */
function toPrazoItem(t: OrganizationTraining): PrazoItem {
  const date = formatDate(trainingDeadline(t));
  return {
    id: t.id,
    primary: `${t.employeeName} — ${t.title}`,
    meta: t.unitName ? `${date} · ${t.unitName}` : date,
  };
}

// ─── Filter / tab types ─────────────────────────────────────────────────────

// Reusa a união exportada por MetricCards (evita drift entre os dois lugares
// que representam o mesmo filtro de status).
type StatusFilter = CardStatusFilter;
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
  const [, setLocation] = useLocation();

  // ── Filter state ──────────────────────────────────────────────────────────
  const [filial, setFilial] = useState<string>(""); // unitId (string)
  const [cargo, setCargo] = useState<string>(""); // position name
  const [normId, setNormId] = useState<string>(""); // id da norma do catálogo
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [search, setSearch] = useState("");
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
  // Na aba de turmas, Cargo/Norma ficam ocultos e não se aplicam às turmas; os
  // cards de status também os ignoram ali, para as contagens baterem com a
  // lista exibida (review #139). `search` também entra aqui pelo mesmo
  // princípio: se não fizer parte de `baseParams`, os cards e os buckets do
  // "Por prazo" continuam mostrando os totais gerais enquanto a lista já foi
  // filtrada pela busca (review final).
  const onClassTab = tab === "turma";
  const baseParams = {
    unitId: filial ? Number(filial) : undefined,
    position: onClassTab ? undefined : cargo || undefined,
    normId: onClassTab || !normId ? undefined : Number(normId),
    search: search.trim() || undefined,
  };

  // ── Query de contagem (metric cards): stats vencido/pendente/programado/
  // realizadoMes exibidos nos cards e usados no total do bucket "Pendentes
  // sem turma" (não há mais card "concluído") ──────────────────────────────
  const countParams: ListOrganizationTrainingsParams = {
    ...baseParams,
    pageSize: 1,
  };
  const { data: countResult } = useListOrganizationTrainings(
    orgId,
    countParams,
    {
      query: {
        enabled,
        queryKey: getListOrganizationTrainingsQueryKey(orgId, countParams),
      },
    },
  );
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

  // ── Buckets do painel "Por prazo" (só quando a aba está ativa) ──────────────
  const onPrazoTab = tab === "prazo";
  const vencidosBucketParams: ListOrganizationTrainingsParams = {
    ...baseParams,
    status: "vencido",
    pageSize: 5,
  };
  const { data: vencidosBucketResult } = useListOrganizationTrainings(
    orgId,
    vencidosBucketParams,
    {
      query: {
        enabled: enabled && onPrazoTab,
        queryKey: getListOrganizationTrainingsQueryKey(
          orgId,
          vencidosBucketParams,
        ),
      },
    },
  );
  const vencidosItems = useMemo(
    () => (vencidosBucketResult?.data ?? []).map(toPrazoItem),
    [vencidosBucketResult],
  );

  const aVencerBucketParams: ListOrganizationTrainingsParams = {
    ...baseParams,
    expiringWithinDays: 30,
    pageSize: 5,
  };
  const { data: aVencerBucketResult } = useListOrganizationTrainings(
    orgId,
    aVencerBucketParams,
    {
      query: {
        enabled: enabled && onPrazoTab,
        queryKey: getListOrganizationTrainingsQueryKey(
          orgId,
          aVencerBucketParams,
        ),
      },
    },
  );
  const aVencerItems = useMemo(
    () => (aVencerBucketResult?.data ?? []).map(toPrazoItem),
    [aVencerBucketResult],
  );

  // "Pendentes sem turma" = pendente ∧ não programado, filtrado no backend
  // (param `onlyPendenteSemTurma`) — uma única query exata, sem buscar
  // programados no cliente para subtrair por id (o corte em 50 pendentes
  // podia esvaziar a coluna com badge > 0 quando os primeiros N pendentes
  // eram todos programados; ver review final). Total exibido continua
  // stats.pendente - stats.programado.
  const pendentesSemTurmaBucketParams: ListOrganizationTrainingsParams = {
    ...baseParams,
    onlyPendenteSemTurma: true,
    pageSize: 5,
  };
  const { data: pendentesSemTurmaBucketResult } = useListOrganizationTrainings(
    orgId,
    pendentesSemTurmaBucketParams,
    {
      query: {
        enabled: enabled && onPrazoTab,
        queryKey: getListOrganizationTrainingsQueryKey(
          orgId,
          pendentesSemTurmaBucketParams,
        ),
      },
    },
  );
  const pendentesSemTurmaItems = useMemo(
    () => (pendentesSemTurmaBucketResult?.data ?? []).map(toPrazoItem),
    [pendentesSemTurmaBucketResult],
  );

  // ── Query principal (Por colaborador / Por prazo) ───────────────────────────
  const mainParams: ListOrganizationTrainingsParams = {
    ...baseParams,
    status:
      statusFilter === "vencido" || statusFilter === "pendente"
        ? statusFilter
        : undefined,
    expiringWithinDays: statusFilter === "a_vencer" ? 30 : undefined,
    onlyProgramado: statusFilter === "programado" ? true : undefined,
    realizadoInCurrentMonth: statusFilter === "realizado" ? true : undefined,
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
  // Máximo aceito pelo endpoint é 500 (ver ListOrganizationTrainingsParams).
  const loadMore = () => setPageSize((n) => Math.min(n + 100, 500));

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

  // Catálogo sempre carregado por completo: fornece os títulos das turmas E os
  // valores reais de norma para o filtro (rótulos fixos não casariam com o param
  // `norm`). Busca todas as páginas — um pageSize fixo cortava a cauda alfabética
  // conforme o catálogo crescia (ver review #139; a org já passou de 800 itens).
  const { data: catalogResult } = useAllTrainingCatalog(orgId, undefined, {
    query: { enabled },
  });
  const catalogTitle = useMemo(
    () => new Map((catalogResult?.data ?? []).map((c) => [c.id, c.title])),
    [catalogResult],
  );
  // Opções de norma vêm do catálogo gerenciável (Configurações → Normas); o
  // filtro casa pelo id do catálogo (norm_ids do item), não pelo texto legado.
  const { data: activeNorms = [] } = useActiveNorms(orgId);
  const normOptions = useMemo(
    () => activeNorms.map((n) => ({ id: n.id, label: n.label })),
    [activeNorms],
  );

  // Colunas Norma/Crítico da tabela "Por colaborador": normLabelById inclui
  // normas inativas de propósito (um item do catálogo pode referenciar uma
  // norma já desativada e o rótulo ainda precisa aparecer). catalogItems usa
  // o mesmo catálogo completo já carregado acima (sem 2ª busca).
  const { data: allNorms = [] } = useAllNorms(orgId);
  const normLabelById = useMemo(() => buildNormLabelMap(allNorms), [allNorms]);
  const catalogItems = useMemo(
    () => catalogResult?.data ?? [],
    [catalogResult],
  );
  const catalogMeta = useMemo(
    () => buildCatalogMeta(catalogItems, normLabelById),
    [catalogItems, normLabelById],
  );

  // Coluna Crítico: NÃO vem do catálogo (training_catalog não tem
  // isCritical) — vem da obrigatoriedade (training_requirements.isCritical),
  // ligada ao treino por requirementId (ver PorColaboradorTable).
  const { data: requirementsResult } = useListTrainingRequirements(
    orgId,
    undefined,
    {
      query: {
        enabled,
        queryKey: getListTrainingRequirementsQueryKey(orgId),
      },
    },
  );
  const requirements = useMemo(
    () => requirementsResult?.data ?? [],
    [requirementsResult],
  );
  const requirementCriticalById = useMemo(
    () => new Map(requirements.map((r) => [r.id, !!r.isCritical])),
    [requirements],
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

  const toggleStatus = (s: StatusFilter) => {
    setStatusFilter((prev) => (prev === s ? "" : s));
    // Os cards são status de treinamento; nem a aba de turmas (o filtro não
    // se aplica) nem a aba "Por prazo" (painel de buckets fixos, ignora
    // statusFilter) reagem ao clique — leva o usuário à visão por
    // colaborador, onde o filtro realmente muda a lista (review #139 e
    // review final).
    if (tab === "turma" || tab === "prazo") setTab("colaborador");
  };

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
        {/* Cargo e Norma não se aplicam à lista de turmas — ocultos nessa aba. */}
        {tab !== "turma" ? (
          <>
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
              value={normId}
              onChange={(e) => setNormId(e.target.value)}
              className="w-auto"
            >
              <option value="">Todas as normas</option>
              {normOptions.map((n) => (
                <option key={n.id} value={String(n.id)}>
                  {n.label}
                </option>
              ))}
            </Select>
          </>
        ) : null}
        <button
          type="button"
          onClick={() => {
            if (tab === "turma") {
              exportGestaoXlsx(
                "turma",
                buildTurmaRows(classes, catalogTitle, unitName),
              );
            } else {
              exportGestaoXlsx(
                "colaborador",
                buildColaboradorRows(
                  tab === "prazo" ? rowsByDeadline : rows,
                  catalogMeta,
                  requirementCriticalById,
                ),
              );
            }
          }}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
        >
          Exportar
        </button>
      </div>

      {/* ── Metric cards (clicáveis) ─────────────────────────────────────── */}
      <MetricCards
        counts={{
          vencido: stats?.vencido ?? 0,
          aVencer: aVencerCount,
          pendente: stats?.pendente ?? 0,
          programado: stats?.programado ?? 0,
          realizadoMes: stats?.realizadoMes ?? 0,
        }}
        active={statusFilter}
        onToggle={toggleStatus}
      />
      <StatusPills active={statusFilter} onToggle={toggleStatus} />
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar colaborador..."
        aria-label="Buscar colaborador"
        className="w-full max-w-xs rounded-md border px-3 py-1.5 text-sm sm:w-auto"
      />

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
          <PorColaboradorTable
            rows={rows}
            catalogMeta={catalogMeta}
            requirementCriticalById={requirementCriticalById}
            loading={mainLoading}
            error={mainError}
            emptyLabel="Nenhum treinamento encontrado para os filtros selecionados."
          />
          <ResultsFooter
            shown={rows.length}
            total={totalRows}
            atMax={pageSize >= 500}
            onMore={loadMore}
          />
        </div>
      ) : null}

      {tab === "prazo" ? (
        <PorPrazoPanel
          vencidos={{ total: stats?.vencido ?? 0, items: vencidosItems }}
          aVencer={{ total: aVencerCount, items: aVencerItems }}
          pendentesSemTurma={{
            total: (stats?.pendente ?? 0) - (stats?.programado ?? 0),
            items: pendentesSemTurmaItems,
          }}
          onSeeAll={(f) => {
            setStatusFilter(f);
            setTab("colaborador");
          }}
          onCreateClass={() => setLocation("/aprendizagem/turmas")}
        />
      ) : null}

      {tab === "turma" ? (
        <div className="rounded-xl border bg-card shadow-sm">
          <PorTurmaTable
            classes={classes}
            catalogTitleById={catalogTitle}
            unitNameById={unitName}
            loading={classLoading}
            error={classError}
          />
        </div>
      ) : null}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ResultsFooter({
  shown,
  total,
  atMax,
  onMore,
}: {
  shown: number;
  total: number;
  atMax: boolean;
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
      {atMax ? (
        // No teto de 500 do endpoint — não dá pra carregar mais aqui.
        <span>Refine os filtros para ver os demais</span>
      ) : (
        <button
          type="button"
          onClick={onMore}
          className="font-medium text-blue-600 hover:underline"
        >
          Carregar mais
        </button>
      )}
    </div>
  );
}
