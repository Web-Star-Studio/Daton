import { describe, expect, it } from "vitest";
import { getDocumentRecipientResolution, summarizeOrganizationContactGroupMembers } from "@/lib/organization-contacts";

describe("organization contacts helpers", () => {
  it("summarizes mixed member groups by source type", () => {
    const summary = summarizeOrganizationContactGroupMembers([
      {
        id: 1,
        sourceType: "system_user",
        sourceId: 10,
        name: "Ana",
        email: "ana@example.com",
        phone: null,
        organizationName: null,
        classificationType: "other",
        classificationDescription: null,
        notes: null,
        archivedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 2,
        sourceType: "employee",
        sourceId: 20,
        name: "Bruno",
        email: "bruno@example.com",
        phone: null,
        organizationName: null,
        classificationType: "other",
        classificationDescription: null,
        notes: null,
        archivedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 3,
        sourceType: "external_contact",
        sourceId: null,
        name: "Cliente X",
        email: "cliente@example.com",
        phone: null,
        organizationName: null,
        classificationType: "customer",
        classificationDescription: null,
        notes: null,
        archivedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    expect(summary).toContain("1 usuário");
    expect(summary).toContain("1 colaborador");
    expect(summary).toContain("1 externo");
  });

  it("deduplicates operational users and non-operational contacts", () => {
    const resolution = getDocumentRecipientResolution(
      [1, 2],
      [
        {
          id: 99,
          name: "Grupo misto",
          description: null,
          memberCount: 3,
          members: [
            {
              id: 11,
              sourceType: "system_user",
              sourceId: 2,
              name: "User 2",
              email: "u2@example.com",
              phone: null,
              organizationName: null,
              classificationType: "other",
              classificationDescription: null,
              notes: null,
              archivedAt: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            {
              id: 12,
              sourceType: "employee",
              sourceId: 3,
              name: "Employee 3",
              email: "emp3@example.com",
              phone: null,
              organizationName: null,
              classificationType: "other",
              classificationDescription: null,
              notes: null,
              archivedAt: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            {
              id: 13,
              sourceType: "external_contact",
              sourceId: null,
              name: "External 4",
              email: "ext4@example.com",
              phone: null,
              organizationName: null,
              classificationType: "supplier",
              classificationDescription: null,
              notes: null,
              archivedAt: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        },
        {
          id: 100,
          name: "Grupo duplicado",
          description: null,
          memberCount: 2,
          members: [
            {
              id: 12,
              sourceType: "employee",
              sourceId: 3,
              name: "Employee 3",
              email: "emp3@example.com",
              phone: null,
              organizationName: null,
              classificationType: "other",
              classificationDescription: null,
              notes: null,
              archivedAt: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            {
              id: 14,
              sourceType: "external_contact",
              sourceId: null,
              name: "External 5",
              email: "ext5@example.com",
              phone: null,
              organizationName: null,
              classificationType: "partner",
              classificationDescription: null,
              notes: null,
              archivedAt: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        },
      ],
      [99, 100],
    );

    expect(resolution.operationalUserCount).toBe(2);
    expect(resolution.nonOperationalContacts).toHaveLength(3);
    expect(resolution.totalContactCount).toBe(5);
  });
});
