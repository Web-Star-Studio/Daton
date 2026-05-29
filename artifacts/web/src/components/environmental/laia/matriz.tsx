import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AlertTriangle,
  Download,
  Eye,
  Flame,
  Layers,
  Pencil,
  RotateCcw,
  Scale,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import {
  useHardDeleteLaiaAssessment,
  useLaiaAssessments,
  useRestoreLaiaAssessment,
  useSetLaiaAssessmentVigence,
  type DrillFilter,
  type LaiaAssessmentListFilters,
  type LaiaAssessmentListItem,
} from "@/lib/environmental-laia-client";
interface LaiaMatrizProps {
  orgId?: number;
  onOpenAssessment?: (assessment: LaiaAssessmentListItem) => void;
  onEditAssessment?: (assessment: LaiaAssessmentListItem) => void;
  drillFilter?: DrillFilter;
  onClearDrill?: () => void;
}

type ChipKey =
  | "todos"
  | "significativos"
  | "nao-significativos"
  | "req-legal"
  | "emergencia"
  | "score-critico"
  | "pendente-vigencia"
  | "lixeira";

const CHIPS: Array<{ key: ChipKey; label: string; emoji?: string }> = [
  { key: "todos", label: "Todos" },
  { key: "significativos", label: "Significativos", emoji: "🔴" },
  { key: "nao-significativos", label: "Não significativos", emoji: "🟢" },
  { key: "req-legal", label: "Com req. legal", emoji: "⚖️" },
  { key: "emergencia", label: "Emergência", emoji: "🆘" },
  { key: "score-critico", label: "Score crítico", emoji: "🔥" },
  { key: "pendente-vigencia", label: "Pendente vigência" },
  { key: "lixeira", label: "Lixeira", emoji: "🗑️" },
];

function chipToFilters(chip: ChipKey): LaiaAssessmentListFilters {
  switch (chip) {
    case "significativos":
      return { significance: "significant" };
    case "nao-significativos":
      return { significance: "not_significant" };
    case "score-critico":
      return { category: "critico" };
    case "pendente-vigencia":
      return { isVigente: false };
    case "lixeira":
      return { view: "trash" };
    default:
      return {};
  }
}

function applyLocalFilters(
  rows: LaiaAssessmentListItem[],
  chip: ChipKey,
  q: string,
) {
  let filtered = rows;
  if (chip === "req-legal") {
    filtered = filtered.filter((r) => r.hasLegalRequirements);
  }
  if (chip === "emergencia") {
    filtered = filtered.filter((r) => r.operationalSituation === "emergencia");
  }
  const trimmed = q.trim().toLowerCase();
  if (trimmed) {
    filtered = filtered.filter((r) =>
      [
        r.aspectCode,
        r.activityOperation,
        r.environmentalAspect,
        r.environmentalImpact,
        r.sectorName,
        r.unitName,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(trimmed)),
    );
  }
  return filtered;
}

// Aplica o filtro de drill-down disparado pelos charts da Gestão à Vista.
// Os campos que não estão expostos no `LaiaAssessmentListItem` (temporality,
// incidence, impactClass, ods) ficam como no-op por enquanto: retornam todos
// os registros até o backend expor esses agregados na listagem.
function applyDrillFilter(
  rows: LaiaAssessmentListItem[],
  drill: DrillFilter | undefined,
): LaiaAssessmentListItem[] {
  if (!drill) return rows;
  switch (drill.dim) {
    case "category":
      return rows.filter((r) => r.category === drill.value);
    case "operationalSituation":
      return rows.filter((r) => (r.operationalSituation ?? "nao_informado") === drill.value);
    case "significance":
      return rows.filter((r) => r.significance === drill.value);
    case "temporality":
    case "incidence":
    case "impactClass":
    case "ods":
      // Não filtrável no client porque a lista não traz esses campos.
      // O chip ainda é exibido para o usuário entender a origem do contexto.
      return rows;
    default:
      return rows;
  }
}

function categoryLabel(category: LaiaAssessmentListItem["category"]) {
  if (category === "critico") return { text: "CRÍTICO", cls: "bg-red-100 text-red-800 border-red-200" };
  if (category === "moderado") return { text: "MODERADO", cls: "bg-amber-100 text-amber-800 border-amber-200" };
  if (category === "desprezivel") return { text: "DESPREZÍVEL", cls: "bg-gray-100 text-gray-700 border-gray-200" };
  return { text: "—", cls: "bg-gray-50 text-gray-500 border-gray-200" };
}

function significanceLabel(s: LaiaAssessmentListItem["significance"]) {
  if (s === "significant") return { text: "● Significativo", cls: "bg-red-50 text-red-700 border-red-200" };
  if (s === "not_significant") return { text: "● Não significativo", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  return { text: "—", cls: "bg-gray-50 text-gray-500 border-gray-200" };
}

function exportAssessmentsCsv(rows: LaiaAssessmentListItem[]) {
  const headers = [
    "Cod",
    "Unidade",
    "Setor",
    "Atividade",
    "Aspecto",
    "Impacto",
    "Score",
    "Categoria",
    "Significancia",
    "RL",
    "DPI",
    "OE",
    "Situacao",
    "Em Vigencia",
  ];
  const csvRows = rows.map((r) =>
    [
      r.aspectCode,
      r.unitName ?? "",
      r.sectorName ?? "",
      r.activityOperation,
      r.environmentalAspect,
      r.environmentalImpact,
      r.totalScore ?? "",
      r.category ?? "",
      r.significance ?? "",
      r.hasLegalRequirements ? "Sim" : "",
      r.hasStakeholderDemand ? "Sim" : "",
      r.hasStrategicOption ? "Sim" : "",
      r.operationalSituation ?? "",
      r.isVigente ? "Sim" : "Não",
    ]
      .map((cell) => {
        // Normaliza quebras de linha e tabs antes de decidir se precisa de aspas:
        // CSV permite \n dentro de aspas duplas, mas Excel/Sheets quebra a linha
        // de qualquer jeito → substituir por espaço é o caminho mais previsível.
        const str = String(cell).replace(/\r?\n/g, " ").replace(/\t/g, " ");
        return /[",;]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
      })
      .join(","),
  );
  const csv = [headers.join(","), ...csvRows].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `matriz-laia-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// Grid de 10 colunas — mantém o alinhamento visual da tabela antiga em estrutura div+aria.
// `[grid-template-columns:...]` arbitrary value do Tailwind v4. minmax garante que colunas
// largas (aspecto, unidade) sobreponham e que colunas pequenas (cod, score) não esticem.
const MATRIX_GRID_TEMPLATE =
  "grid grid-cols-[80px_minmax(160px,1fr)_minmax(280px,1.6fr)_90px_70px_110px_140px_120px_110px_120px] items-stretch";

// Altura estimada por linha (px). Conteúdo line-clamp ainda pode variar levemente;
// useVirtualizer mede o real após mount.
const MATRIX_ROW_ESTIMATE = 56;

// Altura do scroller. Acima de ~12 linhas começa a fazer sentido virtualizar.
const MATRIX_SCROLLER_HEIGHT = 640;

interface MatrixRowProps {
  row: LaiaAssessmentListItem;
  inTrash: boolean;
  onOpenAssessment?: (row: LaiaAssessmentListItem) => void;
  onEditAssessment?: (row: LaiaAssessmentListItem) => void;
  onToggleVigence: (row: LaiaAssessmentListItem) => void | Promise<void>;
  onRestore: (row: LaiaAssessmentListItem) => void | Promise<void>;
  onPurge: (row: LaiaAssessmentListItem) => void | Promise<void>;
}

function MatrixRow({
  row,
  inTrash,
  onOpenAssessment,
  onEditAssessment,
  onToggleVigence,
  onRestore,
  onPurge,
}: MatrixRowProps) {
  const cat = categoryLabel(row.category);
  const sig = significanceLabel(row.significance);
  return (
    <div
      role="row"
      className={`${MATRIX_GRID_TEMPLATE} border-t text-[12px] hover:bg-accent/40`}
    >
      <div role="cell" className="px-3 py-2 font-mono text-[11px]">
        {row.aspectCode}
      </div>
      <div role="cell" className="px-3 py-2">
        <div className="font-medium leading-tight">{row.unitName ?? "—"}</div>
        <div className="text-[11px] text-muted-foreground">
          {row.sectorName ?? "Sem setor"}
        </div>
      </div>
      <div role="cell" className="px-3 py-2 max-w-[420px]">
        <div
          className="line-clamp-2 font-medium leading-tight"
          title={row.environmentalAspect}
        >
          {row.environmentalAspect}
        </div>
        <div
          className="line-clamp-1 text-[11px] text-muted-foreground"
          title={row.environmentalImpact}
        >
          {row.environmentalImpact}
        </div>
      </div>
      <div role="cell" className="px-3 py-2">
        {row.operationalSituation === "emergencia" ? (
          <Badge className="border-red-200 bg-red-50 text-red-700">
            <AlertTriangle className="mr-1 h-3 w-3" /> Emerg.
          </Badge>
        ) : row.operationalSituation === "anormal" ? (
          <Badge variant="outline" className="border-amber-200 text-amber-700">
            Anormal
          </Badge>
        ) : (
          <Badge variant="outline">Normal</Badge>
        )}
      </div>
      <div role="cell" className="px-3 py-2 font-mono">
        {row.totalScore ?? "—"}
      </div>
      <div role="cell" className="px-3 py-2">
        <span
          className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${cat.cls}`}
        >
          {cat.text}
        </span>
      </div>
      <div role="cell" className="px-3 py-2">
        <span
          className={`rounded border px-2 py-0.5 text-[10px] font-medium ${sig.cls}`}
        >
          {sig.text}
        </span>
      </div>
      <div role="cell" className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          {row.hasLegalRequirements && (
            <span title="Requisito Legal">
              <Scale className="h-3.5 w-3.5 text-blue-600" />
            </span>
          )}
          {row.hasStakeholderDemand && (
            <span
              title="Demanda de Partes Interessadas"
              className="text-purple-600 font-bold"
            >
              DPI
            </span>
          )}
          {row.hasStrategicOption && (
            <span title="Opção Estratégica" className="text-emerald-600 font-bold">
              OE
            </span>
          )}
          {!row.hasLegalRequirements &&
            !row.hasStakeholderDemand &&
            !row.hasStrategicOption && (
              <span className="text-muted-foreground">—</span>
            )}
        </div>
      </div>
      <div role="cell" className="px-3 py-2">
        {row.isVigente ? (
          <Badge variant="outline" className="border-emerald-200 text-emerald-700">
            Em vigência
          </Badge>
        ) : (
          <Badge variant="outline" className="border-amber-200 text-amber-700">
            Pendente
          </Badge>
        )}
      </div>
      <div role="cell" className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          {inTrash ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void onRestore(row)}
                title="Restaurar"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void onPurge(row)}
                title="Excluir permanentemente"
              >
                <Trash2 className="h-3.5 w-3.5 text-red-600" />
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenAssessment?.(row)}
                title="Ver detalhes"
              >
                <Eye className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEditAssessment?.(row)}
                title="Editar"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void onToggleVigence(row)}
                title={row.isVigente ? "Marcar como pendente" : "Colocar em vigência"}
              >
                {row.isVigente ? (
                  <Flame className="h-3.5 w-3.5 text-amber-600" />
                ) : (
                  <Flame className="h-3.5 w-3.5 text-emerald-600" />
                )}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface VirtualMatrixBodyProps {
  rows: LaiaAssessmentListItem[];
  inTrash: boolean;
  onOpenAssessment?: (row: LaiaAssessmentListItem) => void;
  onEditAssessment?: (row: LaiaAssessmentListItem) => void;
  onToggleVigence: (row: LaiaAssessmentListItem) => void | Promise<void>;
  onRestore: (row: LaiaAssessmentListItem) => void | Promise<void>;
  onPurge: (row: LaiaAssessmentListItem) => void | Promise<void>;
}

function VirtualMatrixBody({
  rows,
  inTrash,
  onOpenAssessment,
  onEditAssessment,
  onToggleVigence,
  onRestore,
  onPurge,
}: VirtualMatrixBodyProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => MATRIX_ROW_ESTIMATE,
    overscan: 8,
    getItemKey: (index) => rows[index]?.id ?? index,
  });

  return (
    <div
      ref={scrollerRef}
      role="rowgroup"
      className="overflow-auto"
      style={{ height: MATRIX_SCROLLER_HEIGHT }}
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          position: "relative",
          width: "100%",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];
          if (!row) return null;
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <MatrixRow
                row={row}
                inTrash={inTrash}
                onOpenAssessment={onOpenAssessment}
                onEditAssessment={onEditAssessment}
                onToggleVigence={onToggleVigence}
                onRestore={onRestore}
                onPurge={onPurge}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LaiaMatriz({
  orgId,
  onOpenAssessment,
  onEditAssessment,
  drillFilter,
  onClearDrill,
}: LaiaMatrizProps) {
  const [chip, setChip] = useState<ChipKey>("todos");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Debounce 300ms para a busca local: evita recomputar visibleRows a cada keystroke
  // quando a matriz tem 2k+ linhas.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(id);
  }, [query]);

  // chipToFilters é trivial (switch puro): manter memoizado custaria mais do que o cálculo.
  const filters = chipToFilters(chip);
  const { data: rows = [], isLoading } = useLaiaAssessments(orgId, filters);
  const visibleRows = useMemo(
    () => applyDrillFilter(applyLocalFilters(rows, chip, debouncedQuery), drillFilter),
    [rows, chip, debouncedQuery, drillFilter],
  );

  const vigenceMutation = useSetLaiaAssessmentVigence(orgId);
  const restoreMutation = useRestoreLaiaAssessment(orgId);
  const purgeMutation = useHardDeleteLaiaAssessment(orgId);

  const counts = useMemo(() => {
    // Um único laço evita 3 passes de filter() sobre 2k+ linhas.
    let sig = 0;
    let notSig = 0;
    for (const row of rows) {
      if (row.significance === "significant") sig += 1;
      else if (row.significance === "not_significant") notSig += 1;
    }
    return { total: rows.length, sig, notSig };
  }, [rows]);

  const inTrash = chip === "lixeira";

  return (
    <Card>
      <CardHeader className="gap-3 md:flex md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-base">
            Matriz LAIA — Aspectos e Impactos Ambientais
          </CardTitle>
          <p className="text-[12px] text-muted-foreground">
            ISO 14001:2015 · 6.1.2 — Filtre por chips e exporte como evidência.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportAssessmentsCsv(visibleRows)}
            disabled={visibleRows.length === 0}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" /> Exportar CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
          >
            <Layers className="mr-1.5 h-3.5 w-3.5" /> Imprimir evidência
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {CHIPS.map((c) => {
            const active = chip === c.key;
            const suffix =
              c.key === "todos"
                ? ` (${counts.total})`
                : c.key === "significativos"
                  ? ` (${counts.sig})`
                  : c.key === "nao-significativos"
                    ? ` (${counts.notSig})`
                    : "";
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={active}
                onClick={() => setChip(c.key)}
                className={`rounded-full border px-3 py-1 text-[12px] transition-colors ${
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:bg-accent"
                }`}
              >
                {c.emoji && <span className="mr-1">{c.emoji}</span>}
                {c.label}
                {suffix}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Buscar por código, atividade, aspecto ou impacto..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-w-md"
          />
          <span className="text-[11px] text-muted-foreground">
            {visibleRows.length} {visibleRows.length === 1 ? "registro" : "registros"}
          </span>
        </div>

        {drillFilter && (
          // aria-live polite: leitores anunciam a aparição do chip sem roubar foco.
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-[12px] text-primary w-fit"
          >
            <span>
              Filtrado por: <strong>{drillFilter.label}</strong>
            </span>
            {onClearDrill && (
              <button
                type="button"
                onClick={onClearDrill}
                aria-label="Limpar filtro de drill-down"
                className="-mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border">
          <div className="min-w-[1100px]">
            {/* Cabeçalho — sempre visível, fora da área virtualizada. */}
            <div
              role="row"
              className={`${MATRIX_GRID_TEMPLATE} sticky top-0 z-10 bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground`}
            >
              <div className="px-3 py-2 text-left">Cód.</div>
              <div className="px-3 py-2 text-left">Unidade / Setor</div>
              <div className="px-3 py-2 text-left">Aspecto / Impacto</div>
              <div className="px-3 py-2 text-left">Sit.</div>
              <div className="px-3 py-2 text-left">Score</div>
              <div className="px-3 py-2 text-left">Categoria</div>
              <div className="px-3 py-2 text-left">Significância</div>
              <div className="px-3 py-2 text-left">RL/DPI/OE</div>
              <div className="px-3 py-2 text-left">Vigência</div>
              <div className="px-3 py-2 text-right">Ações</div>
            </div>

            {isLoading && (
              <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">
                Carregando avaliações…
              </div>
            )}
            {!isLoading && visibleRows.length === 0 && (
              <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">
                Nenhum aspecto encontrado para esta combinação de filtros.
              </div>
            )}
            {!isLoading && visibleRows.length > 0 && (
              <VirtualMatrixBody
                rows={visibleRows}
                inTrash={inTrash}
                onOpenAssessment={onOpenAssessment}
                onEditAssessment={onEditAssessment}
                onToggleVigence={async (row) => {
                  await vigenceMutation.mutateAsync({
                    assessmentId: row.id,
                    isVigente: !row.isVigente,
                  });
                  toast({
                    title: row.isVigente
                      ? "Avaliação marcada como pendente"
                      : "Avaliação colocada em vigência",
                  });
                }}
                onRestore={async (row) => {
                  await restoreMutation.mutateAsync(row.id);
                  toast({ title: "Avaliação restaurada" });
                }}
                onPurge={async (row) => {
                  if (confirm("Excluir permanentemente?")) {
                    await purgeMutation.mutateAsync(row.id);
                    toast({ title: "Avaliação excluída" });
                  }
                }}
              />
            )}
          </div>
        </div>

        <div className="text-[11px] text-muted-foreground">
          Legenda: F = Frequência · S = Severidade · Soma = Cons + Freq · Crítico ≥ 71 · Moderado 50–70 · Desprezível {"<"} 50
        </div>
      </CardContent>
    </Card>
  );
}
