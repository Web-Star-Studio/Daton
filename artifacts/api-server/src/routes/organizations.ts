import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, organizationsTable, type OrganizationOnboardingStatus } from "@workspace/db";
import {
  CompleteOrganizationOnboardingBody,
  GetOrganizationParams,
  UpdateOrganizationParams,
  UpdateOrganizationBody,
} from "@workspace/api-zod";
import { requireAuth, requireCompletedOnboarding, requireRole, signToken } from "../middlewares/auth";
import { serializeOrganization } from "../lib/serialize-organization";

const router: IRouter = Router();

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
    name: body.data.name ?? undefined,
    tradeName: body.data.tradeName ?? undefined,
    legalIdentifier: body.data.legalIdentifier ?? undefined,
    stateRegistration: body.data.stateRegistration ?? undefined,
    openingDate: body.data.openingDate ?? undefined,
    taxRegime: body.data.taxRegime ?? undefined,
    primaryCnae: body.data.primaryCnae ?? undefined,
    municipalRegistration: body.data.municipalRegistration ?? undefined,
    statusOperacional: body.data.statusOperacional ?? undefined,
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

  if (existing.onboardingStatus === "completed") {
    res.status(409).json({ error: "Onboarding já concluído" });
    return;
  }

  if (existing.onboardingStatus !== "pending") {
    res.status(400).json({ error: "A organização não está apta para concluir o onboarding" });
    return;
  }

  const [org] = await db.transaction(async (tx) => {
    return tx
      .update(organizationsTable)
      .set({
        openingDate: fiscalRegistration.openingDate ?? null,
        taxRegime: fiscalRegistration.taxRegime ?? null,
        primaryCnae: fiscalRegistration.primaryCnae ?? null,
        stateRegistration: fiscalRegistration.stateRegistration ?? null,
        municipalRegistration: fiscalRegistration.municipalRegistration ?? null,
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
        authVersion: existing.authVersion + 1,
      })
      .where(eq(organizationsTable.id, params.data.orgId))
      .returning();
  });

  const token = signToken({
    userId: req.auth!.userId,
    organizationId: req.auth!.organizationId,
    role: req.auth!.role,
    organizationAuthVersion: org.authVersion,
    onboardingStatus: org.onboardingStatus as OrganizationOnboardingStatus,
  });

  res.json({ token, organization: serializeOrganization(org) });
});

router.post("/organizations/:orgId/onboarding/reset", requireAuth, requireRole("org_admin"), async (req, res): Promise<void> => {
  const params = GetOrganizationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (params.data.orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const [existing] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, params.data.orgId));
  if (!existing) {
    res.status(404).json({ error: "Organização não encontrada" });
    return;
  }

  if (existing.onboardingStatus !== "completed") {
    res.status(400).json({ error: "O onboarding só pode ser reiniciado após a conclusão" });
    return;
  }

  const [org] = await db.transaction(async (tx) => {
    return tx
      .update(organizationsTable)
      .set({
        onboardingStatus: "pending",
        onboardingCompletedAt: null,
        authVersion: existing.authVersion + 1,
      })
      .where(eq(organizationsTable.id, params.data.orgId))
      .returning();
  });

  const token = signToken({
    userId: req.auth!.userId,
    organizationId: req.auth!.organizationId,
    role: req.auth!.role,
    organizationAuthVersion: org.authVersion,
    onboardingStatus: org.onboardingStatus as OrganizationOnboardingStatus,
  });

  res.json({ token, organization: serializeOrganization(org) });
});

export default router;
