import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, organizationsTable } from "@workspace/db";
import {
  CompleteOrganizationOnboardingBody,
  GetOrganizationParams,
  UpdateOrganizationParams,
  UpdateOrganizationBody,
} from "@workspace/api-zod";
import { requireAuth, requireCompletedOnboarding, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

function serializeOrganization(org: typeof organizationsTable.$inferSelect) {
  return {
    id: org.id,
    name: org.name,
    legalName: org.legalName ?? org.name,
    tradeName: org.tradeName ?? org.nomeFantasia,
    legalIdentifier: org.legalIdentifier ?? org.cnpj,
    nomeFantasia: org.nomeFantasia ?? org.tradeName,
    cnpj: org.cnpj ?? org.legalIdentifier,
    openingDate: org.openingDate ?? org.dataFundacao,
    taxRegime: org.taxRegime,
    primaryCnae: org.primaryCnae,
    stateRegistration: org.stateRegistration ?? org.inscricaoEstadual,
    municipalRegistration: org.municipalRegistration,
    inscricaoEstadual: org.inscricaoEstadual ?? org.stateRegistration,
    dataFundacao: org.dataFundacao ?? org.openingDate,
    statusOperacional: org.statusOperacional,
    onboardingStatus: org.onboardingStatus,
    onboardingData: org.onboardingData ?? null,
    onboardingCompletedAt: org.onboardingCompletedAt ? org.onboardingCompletedAt.toISOString() : null,
    createdAt: org.createdAt.toISOString(),
    updatedAt: org.updatedAt.toISOString(),
  };
}

router.get("/organizations/:orgId", requireAuth, requireCompletedOnboarding, async (req, res): Promise<void> => {
  const params = GetOrganizationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (params.data.orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, params.data.orgId));
  if (!org) {
    res.status(404).json({ error: "Organização não encontrada" });
    return;
  }

  res.json(serializeOrganization(org));
});

router.patch("/organizations/:orgId", requireAuth, requireCompletedOnboarding, requireRole("org_admin"), async (req, res): Promise<void> => {
  const params = UpdateOrganizationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (params.data.orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const body = UpdateOrganizationBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const updateData: Partial<typeof organizationsTable.$inferInsert> = {
    name: body.data.name ?? body.data.legalName ?? undefined,
    legalName: body.data.legalName ?? body.data.name ?? undefined,
    tradeName: body.data.tradeName ?? body.data.nomeFantasia ?? undefined,
    nomeFantasia: body.data.nomeFantasia ?? body.data.tradeName ?? undefined,
    legalIdentifier: body.data.legalIdentifier ?? body.data.cnpj ?? undefined,
    cnpj: body.data.cnpj ?? body.data.legalIdentifier ?? undefined,
    stateRegistration: body.data.stateRegistration ?? body.data.inscricaoEstadual ?? undefined,
    inscricaoEstadual: body.data.inscricaoEstadual ?? body.data.stateRegistration ?? undefined,
    openingDate: body.data.openingDate ?? body.data.dataFundacao ?? undefined,
    dataFundacao: body.data.dataFundacao ?? body.data.openingDate ?? undefined,
    taxRegime: body.data.taxRegime ?? undefined,
    primaryCnae: body.data.primaryCnae ?? undefined,
    municipalRegistration: body.data.municipalRegistration ?? undefined,
    statusOperacional: body.data.statusOperacional ?? undefined,
    onboardingStatus: body.data.onboardingStatus ?? undefined,
    onboardingCompletedAt: body.data.onboardingCompletedAt ? new Date(body.data.onboardingCompletedAt) : undefined,
    onboardingData: body.data.onboardingData
      ? {
          companyProfile: {
            sector: body.data.onboardingData.companyProfile.sector,
            customSector: body.data.onboardingData.companyProfile.customSector ?? null,
            size: body.data.onboardingData.companyProfile.size,
            goals: body.data.onboardingData.companyProfile.goals,
            maturityLevel: body.data.onboardingData.companyProfile.maturityLevel,
            currentChallenges: body.data.onboardingData.companyProfile.currentChallenges,
          },
        }
      : undefined,
  };

  const [org] = await db.update(organizationsTable)
    .set(updateData)
    .where(eq(organizationsTable.id, params.data.orgId))
    .returning();

  if (!org) {
    res.status(404).json({ error: "Organização não encontrada" });
    return;
  }

  res.json(serializeOrganization(org));
});

router.post("/organizations/:orgId/onboarding/complete", requireAuth, requireRole("org_admin"), async (req, res): Promise<void> => {
  const params = GetOrganizationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (params.data.orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const body = CompleteOrganizationOnboardingBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const { companyProfile, fiscalRegistration } = body.data;

  const [existing] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, params.data.orgId));
  if (!existing) {
    res.status(404).json({ error: "Organização não encontrada" });
    return;
  }

  const [org] = await db.update(organizationsTable)
    .set({
      openingDate: fiscalRegistration.openingDate ?? null,
      taxRegime: fiscalRegistration.taxRegime ?? null,
      primaryCnae: fiscalRegistration.primaryCnae ?? null,
      stateRegistration: fiscalRegistration.stateRegistration ?? null,
      municipalRegistration: fiscalRegistration.municipalRegistration ?? null,
      dataFundacao: fiscalRegistration.openingDate ?? null,
      inscricaoEstadual: fiscalRegistration.stateRegistration ?? null,
      onboardingStatus: "completed",
      onboardingData: {
        companyProfile: {
          sector: companyProfile.sector,
          customSector: companyProfile.customSector ?? null,
          size: companyProfile.size,
          goals: companyProfile.goals,
          maturityLevel: companyProfile.maturityLevel,
          currentChallenges: companyProfile.currentChallenges,
        },
      },
      onboardingCompletedAt: new Date(),
      legalName: existing.legalName ?? existing.name,
      tradeName: existing.tradeName ?? existing.nomeFantasia,
      legalIdentifier: existing.legalIdentifier ?? existing.cnpj,
      name: existing.legalName ?? existing.name,
      nomeFantasia: existing.tradeName ?? existing.nomeFantasia,
      cnpj: existing.legalIdentifier ?? existing.cnpj,
    })
    .where(eq(organizationsTable.id, params.data.orgId))
    .returning();

  res.json(serializeOrganization(org));
});

export default router;
