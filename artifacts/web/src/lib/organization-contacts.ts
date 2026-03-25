import type {
  OrganizationContact,
  OrganizationContactClassificationType,
  OrganizationContactSourceType,
} from "@workspace/api-client-react";

export const ORGANIZATION_CONTACT_SOURCE_LABELS: Record<
  OrganizationContactSourceType,
  string
> = {
  system_user: "Usuário",
  employee: "Colaborador",
  external_contact: "Externo",
};

export const ORGANIZATION_CONTACT_CLASSIFICATION_LABELS: Record<
  OrganizationContactClassificationType,
  string
> = {
  supplier: "Fornecedor",
  customer: "Cliente",
  partner: "Parceiro",
  auditor: "Auditor",
  consultant: "Consultor",
  other: "Outro",
};

export function formatOrganizationContactSummary(contact: OrganizationContact) {
  const source = ORGANIZATION_CONTACT_SOURCE_LABELS[contact.sourceType];
  const classification =
    ORGANIZATION_CONTACT_CLASSIFICATION_LABELS[contact.classificationType];

  return [source, classification, contact.email ?? null]
    .filter(Boolean)
    .join(" • ");
}

export function summarizeOrganizationContactGroupMembers(
  contacts: OrganizationContact[],
) {
  const counts = {
    system_user: 0,
    employee: 0,
    external_contact: 0,
  } satisfies Record<OrganizationContactSourceType, number>;

  for (const contact of contacts) {
    counts[contact.sourceType] += 1;
  }

  return [
    counts.system_user > 0
      ? `${counts.system_user} usuário${counts.system_user > 1 ? "s" : ""}`
      : null,
    counts.employee > 0
      ? `${counts.employee} colaborador${counts.employee > 1 ? "es" : ""}`
      : null,
    counts.external_contact > 0
      ? `${counts.external_contact} externo${
          counts.external_contact > 1 ? "s" : ""
        }`
      : null,
  ]
    .filter(Boolean)
    .join(" • ");
}

export function getDocumentRecipientResolution(
  directRecipientIds: number[],
  groups: Array<{
    id: number;
    members: OrganizationContact[];
  }>,
  selectedGroupIds: number[],
) {
  const operationalUserIds = new Set(directRecipientIds);
  const nonOperationalContacts = new Map<number, OrganizationContact>();

  for (const group of groups) {
    if (!selectedGroupIds.includes(group.id)) continue;

    for (const member of group.members) {
      if (member.sourceType === "system_user" && member.sourceId) {
        operationalUserIds.add(member.sourceId);
        continue;
      }
      nonOperationalContacts.set(member.id, member);
    }
  }

  return {
    operationalUserCount: operationalUserIds.size,
    nonOperationalContacts: [...nonOperationalContacts.values()],
    totalContactCount: operationalUserIds.size + nonOperationalContacts.size,
  };
}
