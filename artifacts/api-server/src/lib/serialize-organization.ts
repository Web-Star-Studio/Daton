import { organizationsTable } from "@workspace/db";

export function serializeOrganization(org: typeof organizationsTable.$inferSelect) {
  return {
    id: org.id,
    name: org.name,
    tradeName: org.tradeName,
    legalIdentifier: org.legalIdentifier,
    openingDate: org.openingDate,
    taxRegime: org.taxRegime,
    primaryCnae: org.primaryCnae,
    stateRegistration: org.stateRegistration,
    municipalRegistration: org.municipalRegistration,
    statusOperacional: org.statusOperacional,
    onboardingStatus: org.onboardingStatus,
    onboardingData: org.onboardingData ?? null,
    onboardingCompletedAt: org.onboardingCompletedAt ? org.onboardingCompletedAt.toISOString() : null,
    createdAt: org.createdAt.toISOString(),
    updatedAt: org.updatedAt.toISOString(),
  };
}
