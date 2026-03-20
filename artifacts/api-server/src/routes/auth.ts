import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db, usersTable, organizationsTable, userModulePermissionsTable } from "@workspace/db";
import { RegisterBody, LoginBody } from "@workspace/api-zod";
import { issueAuthToken, requireAuth } from "../middlewares/auth";
import { serializeOrganization } from "../lib/serialize-organization";

const router: IRouter = Router();

const updateMeBodySchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
});

const updateMyPasswordBodySchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(6),
    confirmPassword: z.string().min(6),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "A confirmação de senha não confere",
    path: ["confirmPassword"],
  });

function serializeAuthUser(user: {
  id: number;
  name: string;
  email: string;
  organizationId: number;
  role: string;
  createdAt: Date;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    organizationId: user.organizationId,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

function serializeMeResponse(
  user: {
    id: number;
    name: string;
    email: string;
    organizationId: number;
    role: string;
    createdAt: Date;
  },
  organization: Parameters<typeof serializeOrganization>[0],
  modules: string[],
) {
  return {
    user: serializeAuthUser(user),
    organization: serializeOrganization(organization),
    modules,
  };
}

router.post("/auth/register", async (req, res): Promise<void> => {
  const rawBody = typeof req.body === "object" && req.body !== null ? req.body as Record<string, unknown> : {};
  const legacyAliasesUsed = [
    "razaoSocial",
    "nomeFantasia",
    "cnpj",
    "adminName",
    "email",
  ].filter((key) => key in rawBody);

  if (legacyAliasesUsed.length > 0) {
    console.warn(
      `[register] deprecated legacy register aliases used: ${legacyAliasesUsed.join(", ")}. ` +
      "Migrate clients to legalName/tradeName/legalIdentifier/adminFullName/adminEmail.",
    );
  }

  const parsed = RegisterBody.safeParse({
    legalName: rawBody.legalName ?? rawBody.razaoSocial,
    tradeName: rawBody.tradeName ?? rawBody.nomeFantasia ?? null,
    legalIdentifier: rawBody.legalIdentifier ?? rawBody.cnpj,
    adminFullName: rawBody.adminFullName ?? rawBody.adminName,
    adminEmail: rawBody.adminEmail ?? rawBody.email,
    password: rawBody.password,
  });
  if (!parsed.success) {
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
    tradeName: tradeName || null,
    legalIdentifier,
    stateRegistration: null,
    openingDate: null,
    onboardingStatus: "pending",
  }).returning();

  const [user] = await db.insert(usersTable).values({
    name: adminFullName.toUpperCase(),
    email: adminEmail,
    passwordHash,
    organizationId: org.id,
    role: "org_admin",
  }).returning();

  const token = await issueAuthToken({ userId: user.id, organizationId: org.id, role: "org_admin" });

  res.status(201).json({
    user: serializeAuthUser(user),
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

  const token = await issueAuthToken({ userId: user.id, organizationId: user.organizationId, role: user.role as any });

  res.status(200).json({
    user: serializeAuthUser(user),
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

  res.json(serializeMeResponse(user, org, modulePerms.map((p) => p.module)));
});

router.patch("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const { userId, organizationId } = req.auth!;

  const parsed = updateMeBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

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

  const { name, email } = parsed.data;
  const normalizedEmail = email.trim();
  const normalizedName = name.trim().toUpperCase();

  const [existingUser] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.email, normalizedEmail), ne(usersTable.id, userId)));

  if (existingUser) {
    res.status(400).json({ error: "Este email já possui uma conta na plataforma" });
    return;
  }

  const [updatedUser] = await db
    .update(usersTable)
    .set({
      name: normalizedName,
      email: normalizedEmail,
    })
    .where(eq(usersTable.id, userId))
    .returning();

  const modulePerms = await db
    .select()
    .from(userModulePermissionsTable)
    .where(eq(userModulePermissionsTable.userId, userId));

  res.json(serializeMeResponse(updatedUser, org, modulePerms.map((p) => p.module)));
});

router.patch("/auth/me/password", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req.auth!;

  const parsed = updateMyPasswordBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(401).json({ error: "Usuário não encontrado" });
    return;
  }

  const passwordMatches = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!passwordMatches) {
    res.status(400).json({ error: "Senha atual inválida" });
    return;
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await db
    .update(usersTable)
    .set({ passwordHash })
    .where(eq(usersTable.id, userId));

  res.json({ message: "Senha atualizada com sucesso" });
});

export default router;
