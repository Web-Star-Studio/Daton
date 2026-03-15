import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable, organizationsTable, userModulePermissionsTable } from "@workspace/db";
import { RegisterBody, LoginBody } from "@workspace/api-zod";
import { signToken, requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { razaoSocial, nomeFantasia, cnpj, adminName, email, password } = parsed.data;

  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing.length > 0) {
    res.status(400).json({ error: "E-mail já cadastrado" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const [org] = await db.insert(organizationsTable).values({
    name: razaoSocial,
    nomeFantasia: nomeFantasia || null,
    cnpj: cnpj || null,
  }).returning();

  const [user] = await db.insert(usersTable).values({
    name: adminName,
    email,
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
      createdAt: org.createdAt.toISOString(),
      updatedAt: org.updatedAt.toISOString(),
    },
    modules: modulePerms.map(p => p.module),
  });
});

export default router;
