import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Tratativas } from "@/pages/app/planos-acao/_components/tratativas";
import type { ActionPlanAnalysis } from "@/pages/app/planos-acao/_components/analises/types";

const metodosAtivos = [{ key: "five_whys" as const, label: "5 Porquês" }];
const labelPorChave = new Map<string, string>([["five_whys", "5 Porquês"]]);

describe("Tratativas — abertura por padrão", () => {
  /**
   * Regressão: a página monta o <Tratativas> com `analyses=[]` (early-return enquanto o
   * plano carrega) e só hidrata `form.analyses` a partir de `plan.analyses` no render
   * seguinte. Um estado que rastreasse as ABERTAS via inicializador lazy sobre `analyses`
   * ficaria vazio para sempre (só roda no mount, quando analyses ainda é []), e todo plano
   * com tratativas salvas abriria colapsado. Rastreando as COLAPSADAS, o default é "aberto"
   * e independe do timing de montagem.
   */
  it("mantém o card expandido quando a tratativa chega DEPOIS do mount (hidratação)", () => {
    const { rerender } = render(
      <Tratativas
        analyses={[]}
        onChange={() => {}}
        metodosAtivos={metodosAtivos}
        labelPorChave={labelPorChave}
      />,
    );

    const analyses: ActionPlanAnalysis[] = [{ key: "five_whys", data: { whys: ["Porque o teste não foi conferido."] } }];
    rerender(
      <Tratativas
        analyses={analyses}
        onChange={() => {}}
        metodosAtivos={metodosAtivos}
        labelPorChave={labelPorChave}
      />,
    );

    const toggle = screen.getByRole("button", { name: /5 Porquês/i, expanded: true });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("nasce expandido quando as tratativas já estão presentes no primeiro render", () => {
    render(
      <Tratativas
        analyses={[{ key: "five_whys", data: { whys: [] } }]}
        onChange={() => {}}
        metodosAtivos={metodosAtivos}
        labelPorChave={labelPorChave}
      />,
    );

    const toggle = screen.getByRole("button", { name: /5 Porquês/i, expanded: true });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });
});
