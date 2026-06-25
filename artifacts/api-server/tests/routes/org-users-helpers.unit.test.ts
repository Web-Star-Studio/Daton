import { describe, expect, it } from "vitest";
import {
  serializeOrgUser,
  shouldSendSetPasswordEmail,
} from "../../src/routes/org-users-helpers";

const baseUser = {
  id: 7,
  name: "MARIA",
  email: "maria@x.com",
  role: "operator",
  unitId: null,
  createdAt: new Date("2026-06-25T12:00:00.000Z"),
  passwordHash: "some-hash" as string | null,
};

describe("serializeOrgUser", () => {
  it("marks passwordSet true when the user has a password hash", () => {
    expect(serializeOrgUser(baseUser, []).passwordSet).toBe(true);
  });

  it("marks passwordSet false when the password hash is null", () => {
    expect(serializeOrgUser({ ...baseUser, passwordHash: null }, []).passwordSet).toBe(
      false,
    );
  });

  it("never leaks the password hash", () => {
    expect(
      serializeOrgUser(baseUser, []) as Record<string, unknown>,
    ).not.toHaveProperty("passwordHash");
  });

  it("serializes the core fields and modules", () => {
    const result = serializeOrgUser(baseUser, ["kpi"]);
    expect(result).toMatchObject({
      id: 7,
      name: "MARIA",
      email: "maria@x.com",
      role: "operator",
      unitId: null,
      modules: ["kpi"],
    });
    expect(result.createdAt).toBe("2026-06-25T12:00:00.000Z");
  });
});

describe("shouldSendSetPasswordEmail", () => {
  it("is true when no password is provided", () => {
    expect(shouldSendSetPasswordEmail(undefined)).toBe(true);
  });

  it("is true for an empty or whitespace-only password", () => {
    expect(shouldSendSetPasswordEmail("")).toBe(true);
    expect(shouldSendSetPasswordEmail("   ")).toBe(true);
  });

  it("is false when a real password is provided", () => {
    expect(shouldSendSetPasswordEmail("secret123")).toBe(false);
  });
});
