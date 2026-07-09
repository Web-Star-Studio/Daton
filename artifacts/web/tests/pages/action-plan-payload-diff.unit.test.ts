import { describe, expect, it } from "vitest";
import { diffActionPlanPayload } from "@/pages/app/planos-acao/_components/payload-diff";

const baseline = {
  title: "Falha na verificação do rastreador",
  description: "Ficha preenchida sem conferência.",
  responsibleUserId: null,
  priority: "medium",
  plan5w2h: { what: "Treinar", why: "Garantir conferência" },
  rootCauseWhys: ["Não foi conferido."],
  gutGravity: null,
};

describe("diffActionPlanPayload", () => {
  it("sends nothing when the form matches the loaded plan", () => {
    expect(diffActionPlanPayload(baseline, { ...baseline })).toEqual({});
  });

  it("sends only the fields the user actually changed", () => {
    const next = { ...baseline, rootCauseWhys: ["Ninguém treinou."], priority: "high" };

    expect(diffActionPlanPayload(baseline, next)).toEqual({
      rootCauseWhys: ["Ninguém treinou."],
      priority: "high",
    });
  });

  /**
   * The bug this exists for: Ana assigns the plan to Thais; twenty seconds later
   * Thais's tab — loaded while responsibleUserId was still null — autosaves an
   * edit to another field and wipes the assignment. A full-payload PATCH makes
   * every open tab a time machine.
   */
  it("leaves a field untouched by this tab out of the payload, even when the server moved on", () => {
    const next = { ...baseline, rootCause: "Falta de treinamento." };

    const payload = diffActionPlanPayload(baseline, next);

    expect(payload).toEqual({ rootCause: "Falta de treinamento." });
    expect(payload).not.toHaveProperty("responsibleUserId");
  });

  it("still sends a field the user deliberately cleared", () => {
    const next = { ...baseline, responsibleUserId: null, description: null };

    expect(diffActionPlanPayload({ ...baseline, responsibleUserId: 32 }, next)).toEqual({
      responsibleUserId: null,
      description: null,
    });
  });

  it("compares nested objects by value, not by reference or key order", () => {
    const next = { ...baseline, plan5w2h: { why: "Garantir conferência", what: "Treinar" } };

    expect(diffActionPlanPayload(baseline, next)).toEqual({});
  });

  it("treats a reordered array as a change", () => {
    const next = { ...baseline, rootCauseWhys: ["a", "b"] };

    expect(diffActionPlanPayload({ ...baseline, rootCauseWhys: ["b", "a"] }, next)).toEqual({
      rootCauseWhys: ["a", "b"],
    });
  });

  it("sends the whole payload when there is no baseline yet", () => {
    expect(diffActionPlanPayload(null, baseline)).toEqual(baseline);
  });

  it("does not confuse null with an absent key", () => {
    expect(diffActionPlanPayload({ gutGravity: null }, { gutGravity: null })).toEqual({});
    expect(diffActionPlanPayload({ gutGravity: null }, { gutGravity: 3 })).toEqual({ gutGravity: 3 });
    expect(diffActionPlanPayload({ gutGravity: 3 }, { gutGravity: null })).toEqual({ gutGravity: null });
  });
});
