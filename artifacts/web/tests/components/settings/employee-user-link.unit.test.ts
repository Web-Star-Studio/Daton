import { describe, expect, it } from "vitest";
import { resolveUserEmailFromEmployeePick } from "@/components/settings/employee-user-link";

describe("resolveUserEmailFromEmployeePick", () => {
  it("uses the picked employee's email over a stale value pre-filled by the browser", () => {
    // The org admin's own login email gets injected by the password manager when
    // the dialog opens; explicitly picking a colaborador must still win.
    const result = resolveUserEmailFromEmployeePick(
      { email: "rebeca@empresa.com" },
      "admin-login@gabardo.com",
    );
    expect(result).toBe("rebeca@empresa.com");
  });

  it("uses the picked employee's email when the field is empty", () => {
    const result = resolveUserEmailFromEmployeePick(
      { email: "rebeca@empresa.com" },
      "",
    );
    expect(result).toBe("rebeca@empresa.com");
  });

  it("keeps the current value when the picked employee has no email", () => {
    const result = resolveUserEmailFromEmployeePick(
      { email: null },
      "typed-by-hand@empresa.com",
    );
    expect(result).toBe("typed-by-hand@empresa.com");
  });

  it("treats a whitespace-only employee email as no email and keeps the current value", () => {
    const result = resolveUserEmailFromEmployeePick(
      { email: "   " },
      "typed-by-hand@empresa.com",
    );
    expect(result).toBe("typed-by-hand@empresa.com");
  });

  it("trims surrounding whitespace from the picked employee's email", () => {
    const result = resolveUserEmailFromEmployeePick(
      { email: "  rebeca@empresa.com  " },
      "",
    );
    expect(result).toBe("rebeca@empresa.com");
  });
});
