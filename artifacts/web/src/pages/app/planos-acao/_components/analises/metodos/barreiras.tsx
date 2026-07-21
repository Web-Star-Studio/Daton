import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  TabelaEstruturada,
  type Coluna,
} from "../primitivos/tabela-estruturada";
import {
  BARRIER_STATUS_LABELS,
  BARRIER_STATUSES,
  BARRIER_TYPE_LABELS,
  BARRIER_TYPES,
  newId,
  type BarrierAnalysisData,
} from "../types";

type Barreira = BarrierAnalysisData["barriers"][number];

export function Barreiras({
  data,
  onChange,
  readOnly,
}: {
  data: BarrierAnalysisData;
  onChange: (next: BarrierAnalysisData) => void;
  readOnly?: boolean;
}) {
  const barreiras = data.barriers ?? [];

  const colunas: ReadonlyArray<Coluna<Barreira>> = [
    {
      kind: "text",
      key: "name",
      header: "Barreira",
      placeholder: "O que deveria ter impedido",
      width: "26%",
    },
    {
      kind: "select",
      key: "type",
      header: "Tipo",
      width: "18%",
      options: BARRIER_TYPES.map((t) => ({
        value: t,
        label: BARRIER_TYPE_LABELS[t],
      })),
    },
    {
      kind: "select",
      key: "status",
      header: "Status",
      width: "16%",
      options: BARRIER_STATUSES.map((s) => ({
        value: s,
        label: BARRIER_STATUS_LABELS[s],
      })),
    },
    {
      kind: "text",
      key: "failureReason",
      header: "Por que falhou",
      placeholder: "Motivo",
      width: "40%",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Perigo / fonte</Label>
          <Input
            value={data.hazard ?? ""}
            readOnly={readOnly}
            placeholder="O que gerou a ameaça"
            onChange={(e) => onChange({ ...data, hazard: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Alvo exposto</Label>
          <Input
            value={data.target ?? ""}
            readOnly={readOnly}
            placeholder="Quem/o que foi atingido"
            onChange={(e) => onChange({ ...data, target: e.target.value })}
          />
        </div>
      </div>
      <TabelaEstruturada<Barreira>
        colunas={colunas}
        rows={barreiras}
        onChange={(next) => onChange({ ...data, barriers: next })}
        onAdd={() =>
          onChange({ ...data, barriers: [...barreiras, { id: newId() }] })
        }
        addLabel="Adicionar barreira"
        readOnly={readOnly}
      />
    </div>
  );
}
