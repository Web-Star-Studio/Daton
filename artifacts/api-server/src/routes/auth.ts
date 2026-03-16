import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable, organizationsTable, userModulePermissionsTable } from "@workspace/db";
import { RegisterBody, LoginBody } from "@workspace/api-zod";
import { signToken, requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.post("/auth/register", async (req, res): Promise<void> => {
  console.log("[register] req.body:", JSON.stringify(req.body, null, 2));
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    console.log("[register] Zod validation error:", JSON.stringify(parsed.error.issues, null, 2));
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { legalName, tradeName, legalIdentifier, adminFullName, adminEmail, password } = parsed.data;

  const existing = await db.select().from(usersTable).where(eq(usersTable.email, adminEmail));
  if (existing.length > 0) {
    res.status(400).json({ error: "E-mail já cadastrado" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const [org] = await db.insert(organizationsTable).values({
    name: legalName,
    nomeFantasia: tradeName || null,
    cnpj: legalIdentifier,
    inscricaoEstadual: null,
    dataFundacao: null,
    legalName,
    tradeName: tradeName || null,
    legalIdentifier,
    stateRegistration: null,
    openingDate: null,
    onboardingStatus: "pending",
  }).returning();

  const [user] = await db.insert(usersTable).values({
    name: adminFullName,
    email: adminEmail,
    passwordHash,
    organizationId: org.id,
    role: "org_admin",
  }).returning();

  const token = signToken({ userId: user.id, organizationId: org.id, role: "org_admin" });

  res.status(201).json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    },
    token,
  });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user) {
    res.status(401).json({ error: "Credenciais inválidas" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Credenciais inválidas" });
    return;
  }

  const token = signToken({ userId: user.id, organizationId: user.organizationId, role: user.role as any });

  res.status(200).json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    },
    token,
  });
});

router.post("/auth/logout", (_req, res): void => {
  res.status(200).json({ message: "Logout realizado com sucesso" });
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const { userId, organizationId } = req.auth!;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(401).json({ error: "Usuário não encontrado" });
    return;
  }

  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, organizationId));
  if (!org) {
    res.status(500).json({ error: "Organização não encontrada" });
    return;
  }

  const modulePerms = await db.select().from(userModulePermissionsTable)
    .where(eq(userModulePermissionsTable.userId, userId));

  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    },
    organization: {
      id: org.id,
      name: org.name,
      legalName: org.legalName ?? org.name,
      tradeName: org.tradeName ?? org.nomeFantasia,
      legalIdentifier: org.legalIdentifier ?? org.cnpj,
      createdAt: org.createdAt.toISOString(),
      updatedAt: org.updatedAt.toISOString(),
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
    },
    modules: modulePerms.map(p => p.module),
  });
});

export default router;
