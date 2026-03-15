import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, usersTable, userModulePermissionsTable } from "@workspace/db";
import { CreateOrgUserBody } from "@workspace/api-zod";
import { requireAuth, requireRole, APP_MODULES } from "../middlewares/auth";
import type { AppModule, UserRole } from "../middlewares/auth";

const router: IRouter = Router();

function serializeOrgUser(user: {
  id: number;
  name: string;
  email: string;
  role: string;
  createdAt: Date;
}, modules: string[]) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    modules,
  };
}

router.get("/organizations/:orgId/users", requireAuth, requireRole("org_admin"), async (req, res): Promise<void> => {
  const orgId = Number(req.params.orgId);
  if (orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const users = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    role: usersTable.role,
    createdAt: usersTable.createdAt,
  }).from(usersTable).where(eq(usersTable.organizationId, orgId));

  const userIds = users.map((user) => user.id);
  const allPerms = userIds.length > 0
    ? await db.select().from(userModulePermissionsTable).where(inArray(userModulePermissionsTable.userId, userIds))
    : [];

  const result = users.map(u => ({
    ...serializeOrgUser(u, allPerms.filter(p => p.userId === u.id).map(p => p.module)),
  }));

  res.json({ users: result });
});

router.post("/organizations/:orgId/users",
  requireAuth,
  requireRole("org_admin"),
  async (req, res): Promise<void> => {
    const orgId = Number(req.params.orgId);

    if (orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const parsed = CreateOrgUserBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { name, email, password, role, modules } = parsed.data;

    const [existingUser] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
    if (existingUser) {
      res.status(400).json({ error: "Este email já possui uma conta na plataforma" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const normalizedModules = role === "org_admin" ? [] : modules;

    try {
      const createdUser = await db.transaction(async (tx) => {
        const [user] = await tx.insert(usersTable).values({
          name,
          email,
          passwordHash,
          organizationId: orgId,
          role,
        }).returning();

        if (normalizedModules.length > 0) {
          await tx.insert(userModulePermissionsTable).values(
            normalizedModules.map((module: AppModule) => ({ userId: user.id, module })),
          );
        }

        return user;
      });

      res.status(201).json(serializeOrgUser(createdUser, normalizedModules));
    } catch (error: unknown) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code?: unknown }).code)
          : undefined;

      if (code === "23505") {
        res.status(400).json({ error: "Este email já possui uma conta na plataforma" });
        return;
      }

      throw error;
    }
  },
);

router.patch("/organizations/:orgId/users/:userId/role",
  requireAuth,
  requireRole("org_admin"),
  async (req, res): Promise<void> => {
    const orgId = Number(req.params.orgId);
    const userId = Number(req.params.userId);

    if (orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const { role } = req.body as { role: string };
    const validRoles: UserRole[] = ["operator", "analyst"];
    if (!validRoles.includes(role as UserRole)) {
      res.status(400).json({ error: "Cargo inválido. Valores permitidos: operator, analyst" });
      return;
    }

    const [user] = await db.select().from(usersTable).where(
      and(eq(usersTable.id, userId), eq(usersTable.organizationId, orgId))
    );

    if (!user) {
      res.status(404).json({ error: "Usuário não encontrado" });
      return;
    }

    if (user.role === "org_admin") {
      res.status(400).json({ error: "Não é possível alterar o cargo do administrador da organização" });
      return;
    }

    if (user.role === "platform_admin") {
      res.status(400).json({ error: "Não é possível alterar o cargo de um administrador da plataforma" });
      return;
    }

    await db.update(usersTable).set({ role }).where(eq(usersTable.id, userId));
    res.json({ message: "Cargo atualizado com sucesso" });
  }
);

router.put("/organizations/:orgId/users/:userId/modules",
  requireAuth,
  requireRole("org_admin"),
  async (req, res): Promise<void> => {
    const orgId = Number(req.params.orgId);
    const userId = Number(req.params.userId);

    if (orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const { modules } = req.body as { modules: string[] };
    if (!Array.isArray(modules) || modules.some(m => !APP_MODULES.includes(m as AppModule))) {
      res.status(400).json({ error: "Módulos inválidos" });
      return;
    }

    const [user] = await db.select().from(usersTable).where(
      and(eq(usersTable.id, userId), eq(usersTable.organizationId, orgId))
    );

    if (!user) {
      res.status(404).json({ error: "Usuário não encontrado" });
      return;
    }

    if (user.role === "org_admin" || user.role === "platform_admin") {
      res.status(400).json({ error: "Não é possível alterar módulos de um administrador" });
      return;
    }

    await db.delete(userModulePermissionsTable).where(eq(userModulePermissionsTable.userId, userId));

    if (modules.length > 0) {
      await db.insert(userModulePermissionsTable).values(
        modules.map(m => ({ userId, module: m }))
      );
    }

    res.json({ message: "Permissões atualizadas com sucesso", modules });
  }
);

export default router;
