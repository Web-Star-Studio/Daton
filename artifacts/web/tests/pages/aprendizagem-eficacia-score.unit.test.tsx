import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { computeEffectivenessScore } from "@/pages/app/aprendizagem/eficacia";
import { ScoreInput } from "@/pages/app/aprendizagem/turmas/detail-panel";

/**
 * Task 3 (fix/score-precisao-nota): a coluna `score` virou numeric(4,2) na
 * Task 1. Este teste prova que o front deixou de truncar a média dos 3
 * critérios Kirkpatrick numa casa decimal (o que produzia parâmetros como
 * "7.3" quando a nota real era 7,33 — e antes da Task 1 fazia o Postgres
 * rejeitar qualquer não-inteiro com 22P02, HTTP 500).
 *
 * Falseabilidade: revertendo `computeEffectivenessScore` para
 * `Math.round(avg * 2 * 10) / 10` (a fórmula antiga, de uma casa decimal),
 * os três casos abaixo passam a falhar — 7.33 vira 7.3, 8.67 vira 8.7,
 * 6.67 vira 6.7.
 */
describe("computeEffectivenessScore (nota de eficácia, 2 casas)", () => {
  it("média 3,67 (4/4/3) -> nota 7,33, não 7,3", () => {
    const avg = (4 + 4 + 3) / 3;
    expect(computeEffectivenessScore(avg)).toBe(7.33);
  });

  it("média 4,33 (5/4/4) -> nota 8,67, não 8,7", () => {
    const avg = (5 + 4 + 4) / 3;
    expect(computeEffectivenessScore(avg)).toBe(8.67);
  });

  it("média 3,33 (3/3/4) -> nota 6,67, não 6,7", () => {
    const avg = (3 + 3 + 4) / 3;
    expect(computeEffectivenessScore(avg)).toBe(6.67);
  });

  it("soma múltipla de 3 continua exata (4/4/4 -> 8)", () => {
    const avg = (4 + 4 + 4) / 3;
    expect(computeEffectivenessScore(avg)).toBe(8);
  });
});

describe("ScoreInput (nota manual de turma) — não reintroduz a armadilha do input controlado", () => {
  it("digitando 8.5 tecla a tecla, o campo mostra exatamente o que foi digitado", async () => {
    const onSave = vi.fn();
    render(<ScoreInput score={null} disabled={false} onSave={onSave} />);
    const input = screen.getByRole("spinbutton");
    const user = userEvent.setup();

    await user.click(input);
    await user.type(input, "8.5");

    expect(input).toHaveValue(8.5);
  });

  it("tem min=0, max=10 e step=0.5", () => {
    render(<ScoreInput score={null} disabled={false} onSave={() => {}} />);
    const input = screen.getByRole("spinbutton");
    expect(input).toHaveAttribute("min", "0");
    expect(input).toHaveAttribute("max", "10");
    expect(input).toHaveAttribute("step", "0.5");
  });

  it("ao sair do campo com um decimal válido, chama onSave com o número (não string truncada)", async () => {
    const onSave = vi.fn();
    render(<ScoreInput score={7} disabled={false} onSave={onSave} />);
    const input = screen.getByRole("spinbutton");
    const user = userEvent.setup();

    await user.clear(input);
    await user.type(input, "7.33");
    await user.tab();

    expect(onSave).toHaveBeenCalledWith(7.33);
  });

  it("valor fora de 0-10 no blur volta ao valor salvo, em vez de gravar lixo", async () => {
    const onSave = vi.fn();
    render(<ScoreInput score={7} disabled={false} onSave={onSave} />);
    const input = screen.getByRole("spinbutton");
    const user = userEvent.setup();

    await user.clear(input);
    await user.type(input, "15");
    await user.tab();

    expect(onSave).not.toHaveBeenCalled();
    expect(input).toHaveValue(7);
  });
});
