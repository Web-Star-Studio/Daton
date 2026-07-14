import { describe, expect, it } from "vitest";
import { pickerMethodOptions } from "@/lib/effectiveness-methods-client";

const methods = [
  { id: 1, organizationId: 1, label: "Auditoria interna", active: true, sortOrder: 0 },
  { id: 2, organizationId: 1, label: "Método aposentado", active: false, sortOrder: 1 },
  { id: 3, organizationId: 1, label: "Outro aposentado", active: false, sortOrder: 2 },
];

describe("pickerMethodOptions", () => {
  it("offers only the active methods when nothing is selected", () => {
    expect(pickerMethodOptions(methods, null).map((m) => m.id)).toEqual([1]);
  });

  it("keeps the inactive method the plan already references, so the selection does not vanish", () => {
    expect(pickerMethodOptions(methods, 2).map((m) => m.id)).toEqual([1, 2]);
  });

  it("does not resurrect the other inactive methods", () => {
    expect(pickerMethodOptions(methods, 2).map((m) => m.id)).not.toContain(3);
  });

  it("preserves catalog order", () => {
    expect(pickerMethodOptions(methods, 3).map((m) => m.label)).toEqual([
      "Auditoria interna",
      "Outro aposentado",
    ]);
  });
});
