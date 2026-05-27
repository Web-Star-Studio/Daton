import { useMemo, useState } from "react";
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
  type LaiaAssessmentListFilters,
  type LaiaAssessmentListItem,
} from "@/lib/environmental-laia-client";

interface LaiaMatrizProps {
  orgId?: number;
  onOpenAssessment?: (assessment: LaiaAssessmentListItem) => void;
  onEditAssessment?: (assessment: LaiaAssessmentListItem) => void;
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

export function LaiaMatriz({
  orgId,
  onOpenAssessment,
  onEditAssessment,
}: LaiaMatrizProps) {
  const [chip, setChip] = useState<ChipKey>("todos");
  const [query, setQuery] = useState("");

  const filters = useMemo(() => chipToFilters(chip), [chip]);
  const { data: rows = [], isLoading } = useLaiaAssessments(orgId, filters);
  const visibleRows = useMemo(
    () => applyLocalFilters(rows, chip, query),
    [rows, chip, query],
  );

  const vigenceMutation = useSetLaiaAssessmentVigence(orgId);
  const restoreMutation = useRestoreLaiaAssessment(orgId);
  const purgeMutation = useHardDeleteLaiaAssessment(orgId);

  const counts = useMemo(() => {
    const total = rows.length;
    const sig = rows.filter((r) => r.significance === "significant").length;
    const notSig = rows.filter((r) => r.significance === "not_significant").length;
    return { total, sig, notSig };
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

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[1100px] border-collapse text-[12px]">
            <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Cód.</th>
                <th className="px-3 py-2 text-left">Unidade / Setor</th>
                <th className="px-3 py-2 text-left">Aspecto / Impacto</th>
                <th className="px-3 py-2 text-left">Sit.</th>
                <th className="px-3 py-2 text-left">Score</th>
                <th className="px-3 py-2 text-left">Categoria</th>
                <th className="px-3 py-2 text-left">Significância</th>
                <th className="px-3 py-2 text-left">RL/DPI/OE</th>
                <th className="px-3 py-2 text-left">Vigência</th>
                <th className="px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-center text-muted-foreground">
                    Carregando avaliações…
                  </td>
                </tr>
              )}
              {!isLoading && visibleRows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-center text-muted-foreground">
                    Nenhum aspecto encontrado para esta combinação de filtros.
                  </td>
                </tr>
              )}
              {visibleRows.map((row) => {
                const cat = categoryLabel(row.category);
                const sig = significanceLabel(row.significance);
                return (
                  <tr key={row.id} className="border-t hover:bg-accent/40">
                    <td className="px-3 py-2 font-mono text-[11px]">
                      {row.aspectCode}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium leading-tight">
                        {row.unitName ?? "—"}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {row.sectorName ?? "Sem setor"}
                      </div>
                    </td>
                    <td className="px-3 py-2 max-w-[320px]">
                      <div className="line-clamp-2 font-medium leading-tight" title={row.environmentalAspect}>
                        {row.environmentalAspect}
                      </div>
                      <div className="line-clamp-1 text-[11px] text-muted-foreground" title={row.environmentalImpact}>
                        {row.environmentalImpact}
                      </div>
                    </td>
                    <td className="px-3 py-2">
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
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {row.totalScore ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${cat.cls}`}>
                        {cat.text}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded border px-2 py-0.5 text-[10px] font-medium ${sig.cls}`}>
                        {sig.text}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        {row.hasLegalRequirements && (
                          <span title="Requisito Legal">
                            <Scale className="h-3.5 w-3.5 text-blue-600" />
                          </span>
                        )}
                        {row.hasStakeholderDemand && (
                          <span title="Demanda de Partes Interessadas" className="text-purple-600 font-bold">
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
                    </td>
                    <td className="px-3 py-2">
                      {row.isVigente ? (
                        <Badge variant="outline" className="border-emerald-200 text-emerald-700">
                          Em vigência
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-200 text-amber-700">
                          Pendente
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {inTrash ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                await restoreMutation.mutateAsync(row.id);
                                toast({ title: "Avaliação restaurada" });
                              }}
                              title="Restaurar"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                if (confirm("Excluir permanentemente?")) {
                                  await purgeMutation.mutateAsync(row.id);
                                  toast({ title: "Avaliação excluída" });
                                }
                              }}
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
                              onClick={async () => {
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="text-[11px] text-muted-foreground">
          Legenda: F = Frequência · S = Severidade · Soma = Cons + Freq · Crítico ≥ 71 · Moderado 50–70 · Desprezível {"<"} 50
        </div>
      </CardContent>
    </Card>
  );
}
