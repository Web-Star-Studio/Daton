import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, usersTable, userModulePermissionsTable } from "@workspace/db";
import { requireAuth, requireRole, APP_MODULES } from "../middlewares/auth";
import type { AppModule, UserRole } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/organizations/:orgId/users", requireAuth, async (req, res): Promise<void> => {
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

  const allPerms = await db.select().from(userModulePermissionsTable);

  const result = users.map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    createdAt: u.createdAt.toISOString(),
    modules: allPerms.filter(p => p.userId === u.id).map(p => p.module),
  }));

  res.json({ users: result });
});

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
