/**
 * Dialog de preview + criação atômica de um Corporativo a partir de um
 * cluster detectado.
 *
 * Fluxo:
 * 1. Ana clica num cluster da seção "Sugestões"
 * 2. Este dialog abre com tudo pré-preenchido:
 *    - Nome: `proposedName` da heurística (refinado pela IA em background)
 *    - Fórmula: copiada do primeiro membro do cluster
 *    - Variáveis: copiadas (são canonicais; cada membro mapeia as suas próprias)
 *    - Children: TODOS marcados por default; Ana desmarca o que não quiser
 * 3. Em background, chama `validateCluster` (IA) — quando volta, atualiza:
 *    - canonicalName (nome humano melhor)
 *    - marca como "outlier" os membros que a IA julgou não pertencer
 * 4. Ana edita nome se quiser, ajusta checkboxes
 * 5. "Criar" → single POST /rollup/from-cluster → indicador criado já configurado
 *
 * Diferença do CorporateRollupDialog (antigo): aqui o indicador ainda NÃO
 * existe. É criado nesta mesma transação junto com a composição. Sem save
 * em duas etapas.
 */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Sparkles, X } from "lucide-react";
import {
  useCreateKpiRollupFromCluster,
  useValidateKpiRollupCluster,
  type KpiRollupCluster,
  type KpiRollupClusterMember,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface CreateFromClusterDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (newIndicatorId: number) => void;
  orgId: number;
  cluster: KpiRollupCluster;
}

export function CreateCorporateFromClusterDialog({
  open,
  onClose,
  onCreated,
  orgId,
  cluster,
}: CreateFromClusterDialogProps) {
  const [name, setName] = useState(cluster.proposedName);
  // Por default todos os membros marcados — Ana desmarca o que não quiser
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    () => new Set(cluster.members.map((m) => m.indicatorId)),
  );

  // IA validation rodando em background
  const validateMut = useValidateKpiRollupCluster();
  const [aiState, setAiState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "done"; canonicalName: string; outlierIds: Set<number>; reasoning: string; confidence: number }
    | { status: "error" }
  >({ status: "idle" });

  useEffect(() => {
    if (!open) return;
    // Reset toda vez que abre
    setName(cluster.proposedName);
    setSelectedIds(new Set(cluster.members.map((m) => m.indicatorId)));
    setAiState({ status: "loading" });

    validateMut
      .mutateAsync({
        orgId,
        data: { childIndicatorIds: cluster.members.map((m) => m.indicatorId) },
      })
      .then((result) => {
        setAiState({
          status: "done",
          canonicalName: result.canonicalName,
          outlierIds: new Set(result.outlierIndicatorIds),
          reasoning: result.reasoning,
          confidence: result.confidence,
        });
        // Substitui o nome pelo canonical da IA SE Ana ainda não editou
        // (comparação contra proposedName original)
        if (result.canonicalName && result.canonicalName !== cluster.proposedName) {
          // Só substitui se o user não tocou ainda
          setName((current) => (current === cluster.proposedName ? result.canonicalName : current));
        }
      })
      .catch(() => setAiState({ status: "error" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cluster.clusterKey]);

  const createMut = useCreateKpiRollupFromCluster();

  // Fórmula/variáveis canonicalizadas: usamos o PRIMEIRO membro como referência.
  // (todos do cluster têm a MESMA shape, então pode usar qualquer um — pegamos
  // o nome de variável do primeiro membro como canonical.)
  const referenceMember = cluster.members[0];

  // Para cada posição da fórmula, mostra o "papel" — usando a label do primeiro membro
  const positionLabels = useMemo(() => {
    return referenceMember.positionToKey.map((key) => {
      const variable = referenceMember.formulaVariables.find((v) => v.key === key);
      return { key, label: variable?.label ?? key };
    });
  }, [referenceMember]);

  function toggleMember(memberId: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  }

  async function handleCreate() {
    if (!name.trim()) {
      toast({ title: "Defina um nome", variant: "destructive" });
      return;
    }
    const selectedMembers = cluster.members.filter((m) => selectedIds.has(m.indicatorId));
    if (selectedMembers.length < 1) {
      toast({ title: "Selecione pelo menos 1 filial", variant: "destructive" });
      return;
    }

    // Constrói o body: nome canonicalizado, fórmula do membro de referência,
    // children com variable mapping POR POSIÇÃO (parent.var_key_pos_N → child.var_key_pos_N)
    const children = selectedMembers.map((m) => {
      const variableMapping: Record<string, string> = {};
      // referenceMember.positionToKey é a ordem das vars na fórmula canonical;
      // m.positionToKey é a ordem nesse filho específico.
      // Mapeamos cada parent key para o child key na mesma posição.
      for (let i = 0; i < referenceMember.positionToKey.length; i++) {
        const parentKey = referenceMember.positionToKey[i];
        const childKey = m.positionToKey[i];
        if (parentKey && childKey) {
          variableMapping[parentKey] = childKey;
        }
      }
      return { childIndicatorId: m.indicatorId, variableMapping };
    });

    try {
      const result = await createMut.mutateAsync({
        orgId,
        data: {
          name: name.trim(),
          measurement: referenceMember.measurement,
          measureUnit: referenceMember.measureUnit ?? null,
          direction: "down", // Default; user pode editar depois no card
          periodicity: cluster.periodicity,
          category: null,
          formulaExpression: referenceMember.formulaExpression,
          formulaVariables: referenceMember.formulaVariables,
          strategy: "sum_inputs",
          children,
        },
      });
      toast({
        title: "Corporativo criado",
        description: `${selectedMembers.length} filia${selectedMembers.length === 1 ? "l" : "is"} agrupada${selectedMembers.length === 1 ? "" : "s"}.`,
      });
      onCreated(result.indicatorId);
      onClose();
    } catch {
      toast({ title: "Erro ao criar Corporativo", variant: "destructive" });
    }
  }

  if (!open) return null;
  const outlierIds = aiState.status === "done" ? aiState.outlierIds : new Set<number>();

  return createPortal(
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }} title="Criar Corporativo a partir do agrupamento">
      <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
        {/* Nome canônico */}
        <div className="space-y-1.5">
          <Label htmlFor="corp-name" className="text-xs">
            Nome do indicador Corporativo
          </Label>
          <Input
            id="corp-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Taxa de avarias no transporte"
          />
          {aiState.status === "loading" && (
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Sparkles className="h-3 w-3 animate-pulse" />
              Refinando nome canônico...
            </p>
          )}
          {aiState.status === "done" && aiState.reasoning && (
            <p className="text-[11px] text-muted-foreground" title="Análise automática">
              {aiState.reasoning}
            </p>
          )}
        </div>

        {/* Fórmula canonicalizada */}
        <div className="rounded-md border bg-muted/30 p-2.5 text-xs">
          <div className="font-medium text-foreground">Fórmula (herdada do agrupamento)</div>
          <div className="mt-1 font-mono text-[11px] text-foreground/80">
            {referenceMember.formulaExpression}
          </div>
          <div className="mt-1.5 text-[11px] text-muted-foreground">
            Variáveis: {positionLabels.map((p) => p.label).join(" · ")}
          </div>
        </div>

        {/* Membros do cluster */}
        <div className="space-y-1.5">
          <Label className="text-xs">
            Filiais que compõem ({selectedIds.size}/{cluster.members.length})
          </Label>
          <p className="text-[11px] text-muted-foreground">
            Desmarque o que não pertencer. Mapeamento das variáveis é automático por posição da fórmula.
          </p>
          <div className="flex flex-col gap-1.5">
            {cluster.members.map((m) => (
              <ClusterMemberRow
                key={m.indicatorId}
                member={m}
                checked={selectedIds.has(m.indicatorId)}
                isOutlier={outlierIds.has(m.indicatorId)}
                onToggle={() => toggleMember(m.indicatorId)}
                positionLabels={positionLabels}
              />
            ))}
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={createMut.isPending}>
          <X className="mr-1 h-3.5 w-3.5" /> Cancelar
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleCreate}
          disabled={createMut.isPending || selectedIds.size === 0 || !name.trim()}
        >
          {createMut.isPending ? (
            <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Criando...</>
          ) : (
            `Criar Corporativo (${selectedIds.size})`
          )}
        </Button>
      </DialogFooter>
    </Dialog>,
    document.body,
  );
}

function ClusterMemberRow({
  member,
  checked,
  isOutlier,
  onToggle,
  positionLabels,
}: {
  member: KpiRollupClusterMember;
  checked: boolean;
  isOutlier: boolean;
  onToggle: () => void;
  positionLabels: Array<{ key: string; label: string }>;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2 rounded-md border p-2 text-xs transition",
        checked ? "border-primary/40 bg-card" : "border-border bg-muted/20",
        isOutlier && "border-amber-300 bg-amber-50/40 dark:bg-amber-950/20",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-1"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-medium text-foreground">{member.name}</span>
        <span className="text-[10px] text-muted-foreground">
          {member.unit ?? "—"} · {member.measureUnit ?? "sem unidade"}
        </span>
        {isOutlier && (
          <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400">
            ⚠ A IA julgou este como possível outlier
          </span>
        )}
        <span className="font-mono text-[10px] text-muted-foreground">
          {positionLabels
            .map((p, i) => `${p.label}=${member.positionToKey[i] ?? "?"}`)
            .join(" · ")}
        </span>
      </div>
    </label>
  );
}
