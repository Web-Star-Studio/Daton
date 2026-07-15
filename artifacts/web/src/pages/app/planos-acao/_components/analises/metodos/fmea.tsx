import { Badge } from "@/components/ui/badge";
import {
  TabelaEstruturada,
  type Coluna,
} from "../primitivos/tabela-estruturada";
import {
  FMEA_DETECTION_SCALE,
  FMEA_OCCURRENCE_SCALE,
  FMEA_RPN_ALERT,
  FMEA_SEVERITY_SCALE,
  fmeaRpn,
  newId,
  type FmeaData,
  type FmeaRow,
} from "../types";

const escalaOptions = (scale: Record<number, string>) =>
  Object.entries(scale).map(([value, label]) => ({ value, label }));

export function Fmea({
  data,
  onChange,
  readOnly,
}: {
  data: FmeaData;
  onChange: (next: FmeaData) => void;
  readOnly?: boolean;
}) {
  const rows = data.rows ?? [];

  const colunas: ReadonlyArray<Coluna<FmeaRow>> = [
    {
      kind: "text",
      key: "failureMode",
      header: "Modo de falha",
      placeholder: "O que pode falhar",
      width: "18%",
    },
    {
      kind: "text",
      key: "effect",
      header: "Efeito",
      placeholder: "Consequência",
      width: "16%",
    },
    {
      kind: "select",
      key: "severity",
      header: "S",
      options: escalaOptions(FMEA_SEVERITY_SCALE),
      width: "9%",
    },
    {
      kind: "text",
      key: "cause",
      header: "Causa",
      placeholder: "Por que falha",
      width: "16%",
    },
    {
      kind: "select",
      key: "occurrence",
      header: "O",
      options: escalaOptions(FMEA_OCCURRENCE_SCALE),
      width: "9%",
    },
    {
      kind: "text",
      key: "currentControl",
      header: "Controle atual",
      placeholder: "O que já detecta",
      width: "14%",
    },
    {
      kind: "select",
      key: "detection",
      header: "D",
      options: escalaOptions(FMEA_DETECTION_SCALE),
      width: "9%",
    },
    {
      kind: "computed",
      header: "RPN",
      width: "9%",
      // Calculado, nunca digitado: o RPN é S×O×D por definição, e deixá-lo aberto
      // permitiria uma nota inconsistente com as três escalas.
      render: (row) => {
        const rpn = fmeaRpn(row);
        if (rpn == null)
          return <span className="text-muted-foreground">—</span>;
        return rpn >= FMEA_RPN_ALERT ? (
          <Badge variant="destructive" className="text-[11px]">
            {rpn}
          </Badge>
        ) : (
          <span className="text-[13px] font-medium">{rpn}</span>
        );
      },
    },
    {
      kind: "text",
      key: "recommendedAction",
      header: "Ação recomendada",
      placeholder: "O que fazer",
      width: "18%",
    },
  ];

  // Os selects guardam string; o modelo guarda número.
  const rowsParaTabela = rows.map((r) => ({
    ...r,
    severity:
      r.severity != null
        ? (String(r.severity) as unknown as number)
        : undefined,
    occurrence:
      r.occurrence != null
        ? (String(r.occurrence) as unknown as number)
        : undefined,
    detection:
      r.detection != null
        ? (String(r.detection) as unknown as number)
        : undefined,
  }));

  const paraModelo = (list: FmeaRow[]): FmeaRow[] =>
    list.map((r) => ({
      ...r,
      severity: r.severity != null ? Number(r.severity) : undefined,
      occurrence: r.occurrence != null ? Number(r.occurrence) : undefined,
      detection: r.detection != null ? Number(r.detection) : undefined,
    }));

  return (
    <TabelaEstruturada<FmeaRow>
      colunas={colunas}
      rows={rowsParaTabela as FmeaRow[]}
      onChange={(next) => onChange({ rows: paraModelo(next) })}
      onAdd={() => onChange({ rows: [...rows, { id: newId() }] })}
      addLabel="Adicionar modo de falha"
      readOnly={readOnly}
      rowClassName={(row) => {
        const rpn = fmeaRpn({
          severity: row.severity != null ? Number(row.severity) : undefined,
          occurrence:
            row.occurrence != null ? Number(row.occurrence) : undefined,
          detection: row.detection != null ? Number(row.detection) : undefined,
        });
        return rpn != null && rpn >= FMEA_RPN_ALERT
          ? "bg-destructive/5"
          : undefined;
      }}
    />
  );
}
