import { describe, expect, it } from "vitest";
import {
  normalizeOptionalPassword,
  validateOptionalPassword,
} from "@/components/settings/create-user-password";

describe("normalizeOptionalPassword", () => {
  it("returns undefined for missing/empty/whitespace (→ e-mail flow)", () => {
    expect(normalizeOptionalPassword(undefined)).toBeUndefined();
    expect(normalizeOptionalPassword("")).toBeUndefined();
    expect(normalizeOptionalPassword("   ")).toBeUndefined();
  });

  it("keeps a non-blank password exactly as typed (no trimming)", () => {
    expect(normalizeOptionalPassword("abc123")).toBe("abc123");
    expect(normalizeOptionalPassword("  abc123  ")).toBe("  abc123  ");
  });
});

describe("validateOptionalPassword", () => {
  it("passes when blank (the user will set it via e-mail)", () => {
    expect(validateOptionalPassword(undefined)).toBe(true);
    expect(validateOptionalPassword("")).toBe(true);
    expect(validateOptionalPassword("      ")).toBe(true);
  });

  it("passes for a 6+ char password (counted as typed)", () => {
    expect(validateOptionalPassword("abc123")).toBe(true);
    expect(validateOptionalPassword("  abc123  ")).toBe(true);
  });

  it("fails when a non-blank password is shorter than 6", () => {
    expect(validateOptionalPassword("abc12")).toBe(
      "A senha deve ter no mínimo 6 caracteres",
    );
  });
});
