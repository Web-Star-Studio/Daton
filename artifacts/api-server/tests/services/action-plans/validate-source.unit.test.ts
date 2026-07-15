import { describe, expect, it } from "vitest";

import { validateSourceRef } from "../../../src/services/action-plans/validate-source";

// As origens criadas dentro do próprio módulo são livres: não apontam para
// nenhuma entidade, então não há o que validar (mesmo caminho de `manual`).
describe("validateSourceRef — origens livres criadas no módulo", () => {
  it("aceita 'improvement' sem sourceRef vinculado a entidade", async () => {
    expect(await validateSourceRef(1, "improvement", {})).toBeNull();
  });

  it("aceita 'corrective' sem sourceRef vinculado a entidade", async () => {
    expect(await validateSourceRef(1, "corrective", {})).toBeNull();
  });

  it("aceita 'norm_requirement' sem sourceRef vinculado a entidade", async () => {
    expect(await validateSourceRef(1, "norm_requirement", {})).toBeNull();
  });

  it("aceita contexto livre em manualContext", async () => {
    expect(
      await validateSourceRef(1, "improvement", { manualContext: "Fila no recebimento" }),
    ).toBeNull();
  });

  it("continua exigindo a célula de origem quando a origem é 'kpi'", async () => {
    expect(await validateSourceRef(1, "kpi", {})).toBe(
      "sourceRef.kpiMonthlyValueId é obrigatório quando sourceModule=kpi",
    );
  });
});
