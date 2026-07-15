import { describe, expect, it } from "vitest";
import { actionPlanStageLevel } from "@/lib/action-plans-client";

const base = { rootCause: null, analyses: null, actionsTotal: 0, actionsDone: 0, status: "open" } as never;

describe("estágio na timeline", () => {
  it("plano vazio fica em Identificação (nível 1)", () => {
    expect(actionPlanStageLevel(base)).toBe(1);
  });

  it("uma tratativa com conteúdo promove a Planejamento", () => {
    const level = actionPlanStageLevel({
      ...base,
      analyses: [{ key: "five_whys", data: { whys: ["porque sim"] } }],
    } as never);
    expect(level).toBeGreaterThanOrEqual(2);
  });

  it("uma tratativa VAZIA não promove (só foi adicionada, não preenchida)", () => {
    const level = actionPlanStageLevel({ ...base, analyses: [{ key: "a3", data: {} }] } as never);
    expect(level).toBe(1);
  });

  it("existir ao menos uma ação promove a Planejamento", () => {
    expect(actionPlanStageLevel({ ...base, actionsTotal: 1 } as never)).toBeGreaterThanOrEqual(2);
  });

  it("ação concluída promove a Execução", () => {
    expect(actionPlanStageLevel({ ...base, actionsTotal: 2, actionsDone: 1 } as never)).toBeGreaterThanOrEqual(3);
  });
});
