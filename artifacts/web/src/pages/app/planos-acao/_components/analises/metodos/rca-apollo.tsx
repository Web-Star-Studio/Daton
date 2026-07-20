import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { EditorArvore } from "../primitivos/editor-arvore";
import {
  RCA_APOLLO_TYPE_LABELS,
  newId,
  type RcaApolloCauseType,
  type RcaApolloData,
  type RcaApolloNode,
} from "../types";

const TIPO_OPTIONS = (["condition", "action"] as RcaApolloCauseType[]).map(
  (t) => ({
    value: t,
    label: RCA_APOLLO_TYPE_LABELS[t],
  }),
);

export function RcaApollo({
  data,
  onChange,
  readOnly,
}: {
  data: RcaApolloData;
  onChange: (next: RcaApolloData) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Efeito primário</Label>
        <Input
          value={data.primaryEffect ?? ""}
          readOnly={readOnly}
          placeholder="O problema, no ponto em que ele dói"
          onChange={(e) => onChange({ ...data, primaryEffect: e.target.value })}
        />
      </div>
      <div>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Causas — todo efeito tem uma Condição e uma Ação; indente para
          desdobrar
        </p>
        <EditorArvore<RcaApolloNode>
          nodes={data.causes ?? []}
          onChange={(causes) => onChange({ ...data, causes })}
          novoNo={() => ({ id: newId(), type: "condition", children: [] })}
          placeholder="Causa"
          addLabel="Adicionar causa"
          readOnly={readOnly}
          extras={(node, update) => (
            <>
              <div className="w-36 shrink-0">
                <SearchableSelect
                  value={node.type}
                  onChange={(v) =>
                    update({
                      ...node,
                      type: (v || "condition") as RcaApolloCauseType,
                    })
                  }
                  options={TIPO_OPTIONS}
                  placeholder="Tipo"
                  searchPlaceholder="Buscar..."
                  emptyMessage="—"
                  disabled={readOnly}
                />
              </div>
              <Input
                className="h-8 min-w-[12rem] flex-1 text-[13px]"
                value={node.evidence ?? ""}
                placeholder="Evidência"
                readOnly={readOnly}
                onChange={(e) => update({ ...node, evidence: e.target.value })}
              />
            </>
          )}
        />
      </div>
    </div>
  );
}
