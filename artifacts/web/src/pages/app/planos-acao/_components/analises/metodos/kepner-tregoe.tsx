import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  TabelaEstruturada,
  type Coluna,
} from "../primitivos/tabela-estruturada";
import {
  KT_DIMENSION_LABELS,
  KT_DIMENSIONS,
  newId,
  type KepnerTregoeData,
  type KTDimension,
} from "../types";

/** A tabela precisa de `id`; a dimensão é a identidade estável da linha. */
type LinhaKT = {
  id: string;
  dimensao: string;
  dimension: KTDimension;
  is?: string;
  isNot?: string;
  distinction?: string;
  change?: string;
};

export function KepnerTregoe({
  data,
  onChange,
  readOnly,
}: {
  data: KepnerTregoeData;
  onChange: (next: KepnerTregoeData) => void;
  readOnly?: boolean;
}) {
  // As 4 dimensões são LINHAS FIXAS: reconstruídas sempre, nunca adicionadas nem removidas.
  const rows: LinhaKT[] = KT_DIMENSIONS.map((dimension) => {
    const r = (data.rows ?? []).find((row) => row.dimension === dimension);
    return {
      id: dimension,
      dimensao: KT_DIMENSION_LABELS[dimension],
      dimension,
      is: r?.is,
      isNot: r?.isNot,
      distinction: r?.distinction,
      change: r?.change,
    };
  });

  const colunas: ReadonlyArray<Coluna<LinhaKT>> = [
    {
      kind: "computed",
      header: "Dimensão",
      width: "20%",
      render: (row) => (
        <span className="text-[12px] font-medium">{row.dimensao}</span>
      ),
    },
    {
      kind: "text",
      key: "is",
      header: "É",
      placeholder: "O que É",
      width: "20%",
    },
    {
      kind: "text",
      key: "isNot",
      header: "NÃO É",
      placeholder: "O que poderia ser, mas não é",
      width: "20%",
    },
    {
      kind: "text",
      key: "distinction",
      header: "Distinção",
      placeholder: "O que distingue",
      width: "20%",
    },
    {
      kind: "text",
      key: "change",
      header: "Mudança",
      placeholder: "O que mudou",
      width: "20%",
    },
  ];

  const causas = data.possibleCauses ?? [];

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Especificação do problema (É / NÃO É)
        </p>
        <TabelaEstruturada<LinhaKT>
          colunas={colunas}
          rows={rows}
          fixedRows
          readOnly={readOnly}
          onChange={(next) =>
            onChange({
              ...data,
              rows: next.map((r) => ({
                dimension: r.dimension,
                is: r.is,
                isNot: r.isNot,
                distinction: r.distinction,
                change: r.change,
              })),
            })
          }
        />
      </div>

      <div>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Causas possíveis — marque a mais provável e registre como foi testada
        </p>
        <div className="space-y-1.5">
          {causas.map((causa) => (
            <div key={causa.id} className="flex items-center gap-2">
              <input
                type="radio"
                name="kt-causa-provavel"
                className="shrink-0 cursor-pointer"
                checked={data.mostProbableCauseId === causa.id}
                disabled={readOnly}
                onChange={() =>
                  onChange({ ...data, mostProbableCauseId: causa.id })
                }
                aria-label="Marcar como causa mais provável"
              />
              <Input
                className="h-8 flex-1 text-[13px]"
                value={causa.text ?? ""}
                placeholder="Causa possível"
                readOnly={readOnly}
                onChange={(e) =>
                  onChange({
                    ...data,
                    possibleCauses: causas.map((c) =>
                      c.id === causa.id ? { ...c, text: e.target.value } : c,
                    ),
                  })
                }
              />
              <Input
                className="h-8 flex-1 text-[13px]"
                value={causa.verification ?? ""}
                placeholder="Como foi verificada"
                readOnly={readOnly}
                onChange={(e) =>
                  onChange({
                    ...data,
                    possibleCauses: causas.map((c) =>
                      c.id === causa.id
                        ? { ...c, verification: e.target.value }
                        : c,
                    ),
                  })
                }
              />
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">
                  Confirmada
                </span>
                <Switch
                  checked={causa.verified ?? false}
                  disabled={readOnly}
                  onCheckedChange={(verified) =>
                    onChange({
                      ...data,
                      possibleCauses: causas.map((c) =>
                        c.id === causa.id ? { ...c, verified } : c,
                      ),
                    })
                  }
                  aria-label="Causa confirmada pelo teste"
                />
              </div>
              {!readOnly && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground"
                  aria-label="Remover causa possível"
                  onClick={() => {
                    if (data.mostProbableCauseId === causa.id) {
                      onChange({
                        ...data,
                        mostProbableCauseId: undefined,
                        possibleCauses: causas.filter((c) => c.id !== causa.id),
                      });
                      return;
                    }
                    onChange({
                      ...data,
                      possibleCauses: causas.filter((c) => c.id !== causa.id),
                    });
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
          {!readOnly && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() =>
                onChange({
                  ...data,
                  possibleCauses: [...causas, { id: newId() }],
                })
              }
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Adicionar causa possível
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
