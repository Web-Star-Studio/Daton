/**
 * Diálogo de criação de um indicador Corporativo a partir de filhos
 * selecionados pelo usuário. O valor do corporativo é a agregação
 * (média/soma/mín/máx) dos VALORES mensais dos filhos — calculado on-read,
 * respeitando meses lançados manualmente.
 *
 * A lista de candidatos é ordenada por similaridade de título + fórmula em
 * relação ao que já foi selecionado (os prováveis irmãos sobem pro topo) —
 * heurística pura, sem IA.
 */
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Search, TriangleAlert } from "lucide-react";
import {
  getListKpiIndicatorsQueryKey,
  getListKpiYearDataQueryKey,
  getListOrgUsersQueryKey,
  useCreateKpiCorporateIndicator,
  useListOrgUsers,
  type KpiIndicator,
} from "@workspace/api-client-react";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SearchableStringSelect } from "@/components/ui/searchable-string-select";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { NON_MONTHLY_PERIODICITIES, PERIODICITY_LABELS, formatKpiValue, normalizeForSearch } from "@/lib/kpi-client";
import { CORPORATE_UNIT_LABEL, isCorporateUnit } from "@/lib/kpi-constants";
import { collectBranchTokens, nameSimilarity, scoreCandidate } from "@/lib/kpi-similarity";

type Strategy = "average" | "sum_values" | "min" | "max";

const STRATEGIES: { value: Strategy; label: string; hint: string }[] = [
  { value: "average", label: "Média", hint: "média dos valores das filiais" },
  { value: "sum_values", label: "Soma", hint: "soma dos valores das filiais" },
  { value: "min", label: "Mínimo", hint: "menor valor entre as filiais" },
  { value: "max", label: "Máximo", hint: "maior valor entre as filiais" },
];

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** Mês de referência mais comum entre filhos não-mensais (null se nenhum). */
function inheritReferenceMonth(children: { referenceMonth?: number | null }[]): number | null {
  const counts = new Map<number, number>();
  for (const c of children) {
    const r = c.referenceMonth;
    if (typeof r === "number" && r >= 1 && r <= 12) counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestN = 0;
  for (const [m, n] of counts) if (n > bestN) { best = m; bestN = n; }
  return best;
}

interface Props {
  open: boolean;
  onClose: () => void;
  orgId: number;
  year: number;
  indicators: KpiIndicator[];
  onCreated?: (indicatorId: number) => void;
  /** Meta (tolerância) do ano por indicador-filho, p/ a prévia calculada. */
  childGoals: Map<number, number | null>;
}

export function CorporateCreateDialog({
  open,
  onClose,
  orgId,
  year,
  indicators,
  onCreated,
  childGoals,
}: Props) {
  const queryClient = useQueryClient();
  const createCorp = useCreateKpiCorporateIndicator();
  const { data: orgUsersData } = useListOrgUsers(orgId, {
    query: { queryKey: getListOrgUsersQueryKey(orgId), enabled: open },
  });
  const orgUsers = orgUsersData?.users ?? [];

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [strategy, setStrategy] = useState<Strategy>("average");
  const [name, setName] = useState("");
  const [nameEdited, setNameEdited] = useState(false);
  const [responsibleName, setResponsibleName] = useState("");
  const [refMonth, setRefMonth] = useState<number | null>(null);
  const [refEdited, setRefEdited] = useState(false);

  const branchTokens = useMemo(
    () => collectBranchTokens(indicators.map((i) => i.unit)),
    [indicators],
  );

  // Candidatos = não-corporativos. (O backend ainda valida vínculo único.)
  const candidates = useMemo(
    () => indicators.filter((i) => !isCorporateUnit(i.unit)),
    [indicators],
  );
  const existingCorporates = useMemo(
    () => indicators.filter((i) => isCorporateUnit(i.unit)),
    [indicators],
  );
  const selectedList = useMemo(
    () => candidates.filter((c) => selectedIds.has(c.id)),
    [candidates, selectedIds],
  );

  // Ordena: selecionados no topo; depois por similaridade ao já selecionado
  // (ou à busca); por fim, alfabético. Filtra por texto da busca.
  const ranked = useMemo(() => {
    const q = normalizeForSearch(search.trim());
    const filtered = q
      ? candidates.filter((c) => normalizeForSearch(c.name).includes(q))
      : candidates;
    return [...filtered].sort((a, b) => {
      const aSel = selectedIds.has(a.id);
      const bSel = selectedIds.has(b.id);
      if (aSel !== bSel) return aSel ? -1 : 1;
      const sa = scoreCandidate(a, selectedList, search, branchTokens);
      const sb = scoreCandidate(b, selectedList, search, branchTokens);
      if (sb !== sa) return sb - sa;
      return a.name.localeCompare(b.name, "pt-BR");
    });
  }, [candidates, search, selectedIds, selectedList, branchTokens]);

  // Herdado dos filhos (1º selecionado); avisa se divergir entre eles.
  const first = selectedList[0];
  const periodicity = first?.periodicity ?? "monthly";
  const measureUnit = first?.measureUnit ?? null;
  const direction: "up" | "down" = first?.direction === "down" ? "down" : "up";
  const inconsistentPeriodicity =
    selectedList.length > 1 &&
    selectedList.some((c) => c.periodicity !== periodicity);

  // Indicador não-mensal precisa de mês de referência (trimestre/semestre/ano).
  // Herda o mais comum dos filhos; o usuário pode ajustar. Para mensal, null.
  const isNonMonthly = NON_MONTHLY_PERIODICITIES.has(periodicity);
  const inheritedRef = useMemo(
    () => inheritReferenceMonth(selectedList),
    [selectedList],
  );
  const referenceMonth = isNonMonthly ? (refEdited ? refMonth : inheritedRef) : null;
  const inconsistentReference =
    isNonMonthly &&
    selectedList.length > 1 &&
    new Set(
      selectedList
        .map((c) => c.referenceMonth)
        .filter((r): r is number => typeof r === "number"),
    ).size > 1;

  // Sugestão de nome a partir do 1º selecionado (parte antes do " - ").
  const suggestedName = useMemo(() => {
    if (!first) return "";
    const base = first.name.split(/\s+-\s+/)[0]?.trim();
    return base ? `${base} - Corporativo` : "";
  }, [first]);
  const effectiveName = nameEdited ? name : name || suggestedName;

  // Aviso de duplicata por NOME (não por fórmula) — evita recriar o que já existe.
  const similarCorporate = useMemo(() => {
    const target = effectiveName.trim();
    if (!target) return null;
    for (const corp of existingCorporates) {
      if (nameSimilarity(target, corp.name, branchTokens) >= 0.6) return corp;
    }
    return null;
  }, [effectiveName, existingCorporates, branchTokens]);

  function toggle(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function reset() {
    setSelectedIds(new Set());
    setSearch("");
    setStrategy("average");
    setName("");
    setNameEdited(false);
    setResponsibleName("");
    setRefMonth(null);
    setRefEdited(false);
  }

  const responsibleUserId =
    orgUsers.find((u) => u.name === responsibleName)?.id ?? null;

  // Prévia da meta calculada: agrega as metas dos filhos selecionados pela
  // estratégia escolhida (mesma regra do backend). Filhos sem meta ficam de fora.
  const computedGoalPreview = useMemo(() => {
    const goals = selectedList
      .map((c) => childGoals.get(c.id))
      .filter((g): g is number => typeof g === "number" && Number.isFinite(g));
    if (goals.length === 0) return null;
    switch (strategy) {
      case "sum_values": return goals.reduce((a, v) => a + v, 0);
      case "average": return goals.reduce((a, v) => a + v, 0) / goals.length;
      case "min": return Math.min(...goals);
      case "max": return Math.max(...goals);
      default: return null;
    }
  }, [selectedList, childGoals, strategy]);

  // Não-mensal só pode ser criado com um mês de referência definido.
  const canSubmit =
    effectiveName.trim().length > 0 &&
    selectedIds.size >= 2 &&
    (!isNonMonthly || referenceMonth != null) &&
    responsibleUserId != null;

  async function handleCreate() {
    if (!canSubmit) return;
    try {
      const res = await createCorp.mutateAsync({
        orgId,
        data: {
          name: effectiveName.trim(),
          strategy,
          childIndicatorIds: [...selectedIds],
          year,
          measureUnit,
          direction,
          periodicity,
          referenceMonth,
          responsibleUserId,
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListKpiIndicatorsQueryKey(orgId) }),
        queryClient.invalidateQueries({ queryKey: getListKpiYearDataQueryKey(orgId, year) }),
      ]);
      toast({ title: "Corporativo criado", description: `${selectedIds.size} indicadores agregados.` });
      const newId = (res as { indicatorId?: number })?.indicatorId;
      reset();
      onClose();
      if (newId) onCreated?.(newId);
    } catch (e) {
      const msg =
        (e as { error?: string })?.error ??
        "Não foi possível criar o corporativo. Verifique os filhos selecionados.";
      toast({ title: "Erro ao criar corporativo", description: msg, variant: "destructive" });
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
      title="Novo indicador corporativo"
      description="Selecione os indicadores das filiais e como agregá-los. O valor é calculado automaticamente a partir deles."
      size="xl"
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Coluna esquerda — seleção de filhos */}
        <div className="flex min-h-0 flex-col gap-2">
          <Label>Indicadores das filiais ({selectedIds.size} selecionados)</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar indicador..."
              className="pl-8"
            />
          </div>
          <div className="max-h-[46vh] overflow-y-auto rounded-lg border">
            {ranked.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                Nenhum indicador encontrado.
              </p>
            ) : (
              ranked.map((c) => {
                const checked = selectedIds.has(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggle(c.id)}
                    title={`${c.name}${c.measurement ? ` — ${c.measurement}` : ""}`}
                    className={cn(
                      "flex w-full items-center gap-2.5 border-b px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-muted/50",
                      checked && "bg-primary/5",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                      )}
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-foreground">
                        {c.name}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {c.unit ?? "sem filial"}
                        {" · "}
                        {PERIODICITY_LABELS[c.periodicity as keyof typeof PERIODICITY_LABELS] ?? c.periodicity}
                      </span>
                    </span>
                    {/* Unidade de medida em destaque (curta: %, KG, R$…) — sem
                       espremer o nome; a filial fica no subtítulo. */}
                    {c.measureUnit ? (
                      <Badge
                        variant="outline"
                        className="shrink-0 whitespace-nowrap text-[10px] font-medium text-foreground/70"
                      >
                        {c.measureUnit}
                      </Badge>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
          {selectedIds.size < 2 && (
            <p className="text-[11px] text-muted-foreground">
              Selecione ao menos 2 indicadores. Os prováveis (mesmo título/fórmula) sobem pro topo conforme você seleciona.
            </p>
          )}
          {inconsistentPeriodicity && (
            <p className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
              Os selecionados têm periodicidades diferentes — será usada a do primeiro ({PERIODICITY_LABELS[periodicity as keyof typeof PERIODICITY_LABELS] ?? periodicity}).
            </p>
          )}
        </div>

        {/* Coluna direita — configuração do corporativo */}
        <div className="flex flex-col gap-4">
          <div className="space-y-1.5">
            <Label>Como agregar</Label>
            <Select value={strategy} onChange={(e) => setStrategy(e.target.value as Strategy)}>
              {STRATEGIES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label} — {s.hint}
                </option>
              ))}
            </Select>
          </div>

          {isNonMonthly && (
            <div className="space-y-1.5">
              <Label>Mês de referência</Label>
              <Select
                value={referenceMonth != null ? String(referenceMonth) : ""}
                onChange={(e) => {
                  setRefEdited(true);
                  setRefMonth(e.target.value ? Number(e.target.value) : null);
                }}
              >
                <option value="">Selecione…</option>
                {MONTH_NAMES.map((m, i) => (
                  <option key={i} value={String(i + 1)}>
                    {m}
                  </option>
                ))}
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Indicador {PERIODICITY_LABELS[periodicity as keyof typeof PERIODICITY_LABELS] ?? periodicity}:
                o cálculo só considera os meses do ciclo a partir daqui.
              </p>
              {inconsistentReference && (
                <p className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                  <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                  As filiais selecionadas têm meses de referência diferentes — confira o escolhido.
                </p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Nome do corporativo</Label>
            <Input
              value={effectiveName}
              onChange={(e) => {
                setNameEdited(true);
                setName(e.target.value);
              }}
              placeholder="Ex.: % de Avaria - Corporativo"
            />
            {similarCorporate && (
              <p className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                Já existe um corporativo parecido: "{similarCorporate.name}".
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Tolerância / meta (calculada)</Label>
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
              {computedGoalPreview != null ? (
                <span className="font-medium text-foreground/90">
                  {formatKpiValue(computedGoalPreview, measureUnit)}
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Selecione filiais com meta definida.
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Calculada das filiais pela estratégia escolhida — atualiza sozinha
              se a meta de uma filial mudar.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Responsável *</Label>
            <SearchableStringSelect
              value={responsibleName}
              onChange={setResponsibleName}
              options={orgUsers.map((u) => u.name)}
              placeholder="Selecione um responsável"
            />
          </div>
        </div>
      </div>

      <DialogFooter className="items-center">
        <span className="mr-auto text-[11px] text-muted-foreground">
          * Responsável obrigatório.
        </span>
        <Button
          variant="ghost"
          onClick={() => {
            reset();
            onClose();
          }}
          disabled={createCorp.isPending}
        >
          Cancelar
        </Button>
        <Button onClick={handleCreate} disabled={!canSubmit || createCorp.isPending}>
          {createCorp.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Criar corporativo
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
