import { SecoesTexto } from "../primitivos/secoes-texto";
import type { A3Data } from "../types";

/**
 * A3 REDUZIDO. As seções "Plano" e "Acompanhamento" do A3 clássico já SÃO as Ações e a
 * Eficácia deste mesmo plano — repeti-las aqui faria o usuário digitar duas vezes a mesma
 * coisa, e as duas cópias divergiriam.
 */
export const A3_SECOES = [
  {
    key: "background",
    label: "Contexto",
    placeholder: "Por que este problema importa agora?",
  },
  {
    key: "currentState",
    label: "Situação atual",
    placeholder: "O que se observa hoje, com dados.",
  },
  {
    key: "goal",
    label: "Meta",
    placeholder: "Aonde se quer chegar, e até quando.",
  },
  {
    key: "analysis",
    label: "Análise",
    placeholder: "Causas identificadas e como se chegou a elas.",
  },
  {
    key: "countermeasures",
    label: "Contramedidas",
    placeholder: "O que atacará as causas.",
  },
] as const;

export function A3({
  data,
  onChange,
  readOnly,
}: {
  data: A3Data;
  onChange: (next: A3Data) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-3">
      <SecoesTexto
        secoes={A3_SECOES}
        value={data}
        onChange={(next) => onChange(next)}
        readOnly={readOnly}
      />
      <p className="text-[12px] text-muted-foreground">
        O <strong>plano</strong> e o <strong>acompanhamento</strong> do A3 são
        as <strong>Ações</strong> e a <strong>Eficácia</strong> deste plano —
        preencha-os nas seções próprias, logo abaixo.
      </p>
    </div>
  );
}
