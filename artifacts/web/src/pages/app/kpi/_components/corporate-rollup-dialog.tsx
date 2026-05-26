/**
 * Dialog de "Composição" do indicador Corporativo (rollup).
 *
 * Comportamento:
 * - Abre quando: (a) user edita um indicador com unit=Corporativo, ou
 *   (b) acaba de criar um Corporativo (dialog aparece automaticamente após save).
 * - Em background, chama `useSuggestKpiRollupChildren` (IA) — quando volta,
 *   pré-marca os checkboxes dos filhos com confidence ≥ 0.7.
 * - Mostra o nome do candidato, badge de confidence colorido, e o
 *   variableMapping sugerido com selects pra override.
 * - Salva via `usePutKpiRollupChildren` (replace-all dos filhos).
 *
 * UX: a Ana não vê a palavra "IA" em nenhum lugar — só os checkboxes
 * pré-selecionados. Se ela não gostar das sugestões, desmarca e marca o
 * que quiser. Conforme a regra: "que seja algo útil pro user e aí ele
 * altera só oq quiser, n precisa saber que foi feito com ia."
 */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import {
  getListKpiRollupChildrenQueryKey,
  useListKpiIndicators,
  useListKpiRollupChildren,
  usePutKpiRollupChildren,
  useSuggestKpiRollupChildren,
  type KpiIndicator,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { SearchableStringSelect } from "@/components/ui/searchable-string-select";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type ChildSelection = {
  childIndicatorId: number;
  selected: boolean;
  variableMapping: Record<string, string>;
};

interface CorporateRollupDialogProps {
  open: boolean;
  onClose: () => void;
  orgId: number;
  parentIndicator: KpiIndicator;
}

export function CorporateRollupDialog({
  open,
  onClose,
  orgId,
  parentIndicator,
}: CorporateRollupDialogProps) {
  const parentVars = parentIndicator.formulaVariables ?? [];

  // Carrega o catálogo de indicadores (pra mostrar nome + variáveis dos filhos)
  const { data: allIndicators = [] } = useListKpiIndicators(orgId);
  const indicatorById = useMemo(
    () => new Map(allIndicators.map((i) => [i.id, i])),
    [allIndicators],
  );

  // Carrega filhos JÁ configurados (pra repopular se for edit)
  const { data: existingChildren = [] } = useListKpiRollupChildren(orgId, parentIndicator.id, {
    query: {
      queryKey: getListKpiRollupChildrenQueryKey(orgId, parentIndicator.id),
      enabled: open,
    },
  });

  // Dispara IA em background quando o dialog abre
  const suggestMut = useSuggestKpiRollupChildren();
  const [aiLoading, setAiLoading] = useState(false);
  const [selections, setSelections] = useState<ChildSelection[]>([]);

  useEffect(() => {
    if (!open) return;
    // Reset state ao reabrir
    setSelections([]);
    setAiLoading(true);

    // Primeiro popula com filhos existentes (sempre marcados)
    const baseFromExisting: ChildSelection[] = existingChildren.map((c) => ({
      childIndicatorId: c.childIndicatorId,
      selected: true,
      variableMapping: { ...(c.variableMapping ?? {}) },
    }));

    // Depois roda IA pra propor adicionais
    suggestMut
      .mutateAsync({ orgId, indicatorId: parentIndicator.id })
      .then(({ suggestions = [] }) => {
        // Merge: existentes + sugestões que ainda não estão nos existentes
        const existingIds = new Set(baseFromExisting.map((b) => b.childIndicatorId));
        const fromAi: ChildSelection[] = suggestions
          .filter((s) => !existingIds.has(s.childIndicatorId))
          .map((s) => ({
            childIndicatorId: s.childIndicatorId,
            // Pré-marca apenas com confidence >= 0.7 — abaixo disso aparece
            // como sugestão duvidosa (visível mas desmarcado)
            selected: s.confidence >= 0.7,
            variableMapping: { ...(s.variableMapping ?? {}) },
          }));
        setSelections([...baseFromExisting, ...fromAi]);
      })
      .catch(() => {
        // Sem IA, só mostra os existentes
        setSelections(baseFromExisting);
      })
      .finally(() => setAiLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, parentIndicator.id]);

  const putMut = usePutKpiRollupChildren();
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const childrenToSave = selections
      .filter((s) => s.selected)
      .map((s) => ({
        childIndicatorId: s.childIndicatorId,
        variableMapping: s.variableMapping,
      }));

    setSaving(true);
    try {
      await putMut.mutateAsync({
        orgId,
        indicatorId: parentIndicator.id,
        data: {
          children: childrenToSave,
          strategy: "sum_inputs",
        },
      });
      toast({
        title: "Composição salva",
        description: `${childrenToSave.length} filial${childrenToSave.length === 1 ? "" : "s"} compõe${childrenToSave.length === 1 ? "" : "m"} este Corporativo.`,
      });
      onClose();
    } catch {
      toast({ title: "Erro ao salvar composição", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function toggleSelection(childId: number) {
    setSelections((prev) =>
      prev.map((s) => (s.childIndicatorId === childId ? { ...s, selected: !s.selected } : s)),
    );
  }

  function setMapping(childId: number, parentKey: string, childKey: string) {
    setSelections((prev) =>
      prev.map((s) =>
        s.childIndicatorId === childId
          ? { ...s, variableMapping: { ...s.variableMapping, [parentKey]: childKey } }
          : s,
      ),
    );
  }

  if (!open) return null;

  return createPortal(
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }} title="Composição do indicador corporativo">
      <div className="flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
        <p className="text-sm text-muted-foreground">
          Selecione os indicadores das filiais que compõem este Corporativo.
          O sistema vai somar os valores das filiais antes de aplicar a fórmula —
          matematicamente correto para razões/percentuais (mesmo cálculo que
          você faz manualmente hoje, mas automático).
        </p>

        {aiLoading && selections.length === 0 && (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Analisando o catálogo da organização e propondo composição...
          </div>
        )}

        {!aiLoading && selections.length === 0 && (
          <div className="rounded-lg border py-8 text-center text-sm text-muted-foreground">
            Nenhum candidato encontrado.
            <br />
            <span className="text-xs">Crie indicadores filial-level com a mesma periodicidade primeiro.</span>
          </div>
        )}

        {selections.length > 0 && (
          <div className="flex flex-col gap-2">
            {selections.map((sel) => {
              const child = indicatorById.get(sel.childIndicatorId);
              if (!child) return null;
              const childVarKeys = (child.formulaVariables ?? []).map((v) => v.key);
              return (
                <div
                  key={sel.childIndicatorId}
                  className={cn(
                    "rounded-lg border p-3 transition",
                    sel.selected ? "bg-card border-primary/40" : "bg-muted/20 border-border",
                  )}
                >
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sel.selected}
                      onChange={() => toggleSelection(sel.childIndicatorId)}
                      className="mt-1"
                    />
                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <span className="text-sm font-medium">{child.name}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {child.unit ?? "—"} · {child.measureUnit ?? ""}
                      </span>
                    </div>
                  </label>

                  {sel.selected && parentVars.length > 0 && (
                    <div className="mt-3 ml-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {parentVars.map((pv) => (
                        <div key={pv.key} className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">
                            {pv.label}
                          </Label>
                          <SearchableStringSelect
                            value={sel.variableMapping[pv.key] ?? ""}
                            onChange={(v) => setMapping(sel.childIndicatorId, pv.key, v)}
                            options={childVarKeys}
                            placeholder="— escolha a variável correspondente —"
                            searchPlaceholder="Buscar variável..."
                            emptyMessage="Sem variáveis correspondentes"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={saving}>
          <X className="h-3.5 w-3.5 mr-1" /> Cancelar
        </Button>
        <Button type="button" size="sm" onClick={handleSave} disabled={saving || aiLoading}>
          {saving ? "Salvando..." : `Salvar composição (${selections.filter((s) => s.selected).length})`}
        </Button>
      </DialogFooter>
    </Dialog>,
    document.body,
  );
}
