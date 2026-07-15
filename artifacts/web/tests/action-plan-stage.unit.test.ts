import { describe, expect, it } from "vitest";
import { actionPlanStageLevel } from "@/lib/action-plans-client";

const base = { rootCause: null, analyses: null, actionsTotal: 0, actionsDone: 0, status: "open" } as never;

describe("estágio na timeline", () => {
  it("uma tratativa com conteúdo promove a Planejamento", () => {
    const level = actionPlanStageLevel({
      ...base,
      analyses: [{ key: "five_whys", data: { whys: ["porque sim"] } }],
    } as never);
    expect(level).toBeGreaterThanOrEqual(1);
  });

  it("uma tratativa VAZIA não promove (só foi adicionada, não preenchida)", () => {
    const level = actionPlanStageLevel({ ...base, analyses: [{ key: "a3", data: {} }] } as never);
    expect(level).toBe(0);
  });

  it("existir ao menos uma ação promove a Planejamento", () => {
    expect(actionPlanStageLevel({ ...base, actionsTotal: 1 } as never)).toBeGreaterThanOrEqual(1);
  });

  it("ação concluída promove a Execução", () => {
    expect(actionPlanStageLevel({ ...base, actionsTotal: 2, actionsDone: 1 } as never)).toBeGreaterThanOrEqual(2);
  });
});
