import { describe, it, expect } from "vitest";
import {
  buildGapRequirementKey,
  formatGapDeadline,
} from "../../../src/services/aprendizagem/gap-deadlines";

describe("buildGapRequirementKey", () => {
  it("education ignora nome/tipo — sempre a mesma chave fixa", () => {
    expect(buildGapRequirementKey("education")).toBe("education");
    expect(buildGapRequirementKey("education", "qualquer", "coisa")).toBe(
      "education",
    );
  });

  it("competency normaliza nome+tipo (mesma chave do resolvedor de competência)", () => {
    expect(
      buildGapRequirementKey("competency", "Auditor Interno", "conhecimento"),
    ).toBe("auditor interno::conhecimento");
    // Maiúscula/minúscula e espaço não mudam a chave.
    expect(
      buildGapRequirementKey("competency", "  AUDITOR INTERNO  ", "Conhecimento"),
    ).toBe("auditor interno::conhecimento");
  });
});

describe("formatGapDeadline", () => {
  const baseRow = {
    id: 1,
    organizationId: 1,
    employeeId: 1,
    requirementType: "education",
    requirementKey: "education",
    dueDate: "2026-06-01",
    resolvedAt: null,
    lastNotifiedOverdueAt: null,
    createdById: 1,
    updatedById: 1,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  };

  it("undefined -> null", () => {
    expect(formatGapDeadline(undefined)).toBeNull();
  });

  it("data futura e não resolvido -> overdue false", () => {
    const result = formatGapDeadline(baseRow, "2026-01-15");
    expect(result?.overdue).toBe(false);
    expect(result?.dueDate).toBe("2026-06-01");
  });

  it("data passada e não resolvido -> overdue true", () => {
    const result = formatGapDeadline(baseRow, "2026-07-01");
    expect(result?.overdue).toBe(true);
  });

  it("resolvido -> overdue false mesmo com data passada", () => {
    const result = formatGapDeadline(
      { ...baseRow, resolvedAt: new Date("2026-06-15T00:00:00Z") },
      "2026-07-01",
    );
    expect(result?.overdue).toBe(false);
    expect(result?.resolvedAt).toBe("2026-06-15T00:00:00.000Z");
  });
});
