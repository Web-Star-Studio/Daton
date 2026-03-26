import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({
  organizationsTable: {},
}));

import { serializeOrganization } from "../../src/lib/serialize-organization";

const baseOrg = {
  id: 1,
  name: "Acme Corp",
  tradeName: "Acme",
  legalIdentifier: "12.345.678/0001-99",
  openingDate: "2020-01-01",
  taxRegime: "lucro_real",
  primaryCnae: "62.01-5-01",
  stateRegistration: "123456",
  municipalRegistration: "654321",
  statusOperacional: "active",
  onboardingStatus: "completed",
  onboardingData: null,
  onboardingCompletedAt: new Date("2020-06-01T12:00:00.000Z"),
  authVersion: 1,
  createdAt: new Date("2020-01-01T00:00:00.000Z"),
  updatedAt: new Date("2020-06-01T12:00:00.000Z"),
};

describe("serializeOrganization", () => {
  it("maps all fields to the API response shape", () => {
    const result = serializeOrganization(baseOrg as never);
    expect(result).toEqual({
      id: 1,
      name: "Acme Corp",
      tradeName: "Acme",
      legalIdentifier: "12.345.678/0001-99",
      openingDate: "2020-01-01",
      taxRegime: "lucro_real",
      primaryCnae: "62.01-5-01",
      stateRegistration: "123456",
      municipalRegistration: "654321",
      statusOperacional: "active",
      onboardingStatus: "completed",
      onboardingData: null,
      onboardingCompletedAt: "2020-06-01T12:00:00.000Z",
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-06-01T12:00:00.000Z",
    });
  });

  it("converts Date objects to ISO strings", () => {
    const result = serializeOrganization(baseOrg as never);
    expect(result.createdAt).toBe("2020-01-01T00:00:00.000Z");
    expect(result.updatedAt).toBe("2020-06-01T12:00:00.000Z");
    expect(result.onboardingCompletedAt).toBe("2020-06-01T12:00:00.000Z");
  });

  it("returns null for onboardingCompletedAt when null", () => {
    const result = serializeOrganization({ ...baseOrg, onboardingCompletedAt: null } as never);
    expect(result.onboardingCompletedAt).toBeNull();
  });

  it("returns null for onboardingData when undefined", () => {
    const result = serializeOrganization({ ...baseOrg, onboardingData: undefined } as never);
    expect(result.onboardingData).toBeNull();
  });
});
