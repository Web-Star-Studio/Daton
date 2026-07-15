import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { EditorArvore } from "../primitivos/editor-arvore";
import {
  FAULT_TREE_GATE_LABELS,
  newId,
  type FaultTreeData,
  type FaultTreeGate,
  type FaultTreeNode,
} from "../types";

const GATE_OPTIONS = (["OR", "AND"] as FaultTreeGate[]).map((g) => ({
  value: g,
  label: FAULT_TREE_GATE_LABELS[g],
}));

export function ArvoreFalhas({
  data,
  onChange,
  readOnly,
}: {
  data: FaultTreeData;
  onChange: (next: FaultTreeData) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Evento topo</Label>
        <Input
          value={data.topEvent ?? ""}
          readOnly={readOnly}
          placeholder="A falha que se quer explicar"
          onChange={(e) => onChange({ ...data, topEvent: e.target.value })}
        />
      </div>
      <div>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Eventos — indente para desdobrar a causa acima
        </p>
        <EditorArvore<FaultTreeNode>
          nodes={data.nodes ?? []}
          onChange={(nodes) => onChange({ ...data, nodes })}
          novoNo={() => ({ id: newId(), gate: "OR", children: [] })}
          placeholder="Evento / falha"
          addLabel="Adicionar evento"
          readOnly={readOnly}
          extras={(node, update) =>
            // A porta só diz alguma coisa quando há filhos: "E" = todos precisam ocorrer,
            // "OU" = qualquer um basta. Num nó folha ela seria ruído.
            node.children.length > 0 ? (
              <div className="w-24 shrink-0">
                <SearchableSelect
                  value={node.gate}
                  onChange={(v) =>
                    update({ ...node, gate: (v || "OR") as FaultTreeGate })
                  }
                  options={GATE_OPTIONS}
                  placeholder="Porta"
                  searchPlaceholder="Buscar..."
                  emptyMessage="—"
                  disabled={readOnly}
                />
              </div>
            ) : null
          }
        />
      </div>
    </div>
  );
}
