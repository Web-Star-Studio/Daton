import { describe, expect, it } from "vitest";
import { canResendAccessEmail } from "@/components/settings/access-email";

describe("canResendAccessEmail", () => {
  const pendingUser = { id: 10, passwordSet: false };

  it("is true when the user has not set a password and is not the current user", () => {
    expect(canResendAccessEmail(pendingUser, 1)).toBe(true);
  });

  it("is false when the user already set a password", () => {
    expect(canResendAccessEmail({ id: 10, passwordSet: true }, 1)).toBe(false);
  });

  it("is false for the current user", () => {
    expect(canResendAccessEmail(pendingUser, 10)).toBe(false);
  });

  it("is false when passwordSet is unknown (older API response)", () => {
    expect(canResendAccessEmail({ id: 10, passwordSet: undefined }, 1)).toBe(false);
  });
});
