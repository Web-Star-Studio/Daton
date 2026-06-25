import { Router, type IRouter } from "express";
import crypto from "crypto";
import { eq, and, inArray, isNull } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db, usersTable, userModulePermissionsTable, unitsTable, passwordResetTokensTable } from "@workspace/db";
import { requireAuth, requireCompletedOnboarding, requireRole, requireModuleAccess, APP_MODULES } from "../middlewares/auth";
import type { AppModule } from "../middlewares/auth";
import { getResendClient } from "../lib/resend";
import { getAppBaseUrl } from "../lib/app-url";
import { buildSetPasswordEmail } from "../lib/auth-emails";
import { serializeOrgUser, shouldSendSetPasswordEmail } from "./org-users-helpers";

const router: IRouter = Router();

// Usuários criados sem senha definem a própria via link por e-mail (reusa a
// infra de password-reset). O token de criação dura 24h.
const SET_PASSWORD_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

const createOrgUserBodySchema = z
  .object({
    name: z.string().min(1),
    email: z.string().email(),
    // Opcional: em branco/whitespace ⇒ normaliza para undefined e envia e-mail
    // para o usuário definir a própria senha. Caso contrário, mínimo 6.
    password: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().min(6).optional(),
    ),
    role: z.enum(["org_admin", "manager", "operator", "analyst"]),
    modules: z.array(z.enum(APP_MODULES)).default([]),
    unitId: z.number().int().nullable().optional(),
  })
  .refine((d) => d.role !== "manager" || (d.unitId !== null && d.unitId !== undefined), {
    message: "Gerente requer uma filial (unitId)",
    path: ["unitId"],
  });

function buildSetPasswordUrl(token: string): string {
  return `${getAppBaseUrl()}/auth/redefinir-senha?token=${token}`;
}

// Invalida tokens pendentes do usuário e cria um novo (24h). Usado no reenvio.
async function issueSetPasswordToken(userId: number): Promise<string> {
  await db
    .update(passwordResetTokensTable)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResetTokensTable.userId, userId), isNull(passwordResetTokensTable.usedAt)));
  const token = crypto.randomBytes(32).toString("hex");
  await db.insert(passwordResetTokensTable).values({
    userId,
    token,
    expiresAt: new Date(Date.now() + SET_PASSWORD_TOKEN_TTL_MS),
  });
  return token;
}

async function trySendSetPasswordEmail(setPasswordUrl: string, to: string): Promise<boolean> {
  try {
    const { client, fromEmail } = await getResendClient();
    const { subject, html } = buildSetPasswordEmail(setPasswordUrl);
    // Resend retorna { data, error } e NÃO lança em erro de API/entrega —
    // é preciso inspecionar o campo error para saber se realmente foi enviado.
    const { error } = await client.emails.send({ from: fromEmail, to, subject, html });
    if (error) {
      console.error("Falha ao enviar e-mail de definição de senha:", error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("Falha ao enviar e-mail de definição de senha:", e);
    return false;
  }
}

// Gerentes podem LER a lista de usuários (read-only) para atribuir o responsável de um indicador.
// Criar/alterar usuários permanece restrito a org_admin (POST/PATCH/PUT abaixo).
router.get("/organizations/:orgId/users", requireAuth, requireCompletedOnboarding, requireRole("org_admin", "manager"), requireModuleAccess("kpi"), async (req, res): Promise<void> => {
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
    unitId: usersTable.unitId,
    createdAt: usersTable.createdAt,
    passwordHash: usersTable.passwordHash,
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
  requireCompletedOnboarding,
  requireRole("org_admin"),
  async (req, res): Promise<void> => {
    const orgId = Number(req.params.orgId);

    if (orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const parsed = createOrgUserBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { name, email, password, role, modules } = parsed.data;
    // Filial é opcional para qualquer papel (obrigatória só p/ manager, via refine
    // no schema) — usada também na identidade/escopo das Pendências.
    const unitId = parsed.data.unitId ?? null;

    if (unitId !== null) {
      const [unitRow] = await db
        .select({ id: unitsTable.id })
        .from(unitsTable)
        .where(and(eq(unitsTable.id, unitId), eq(unitsTable.organizationId, orgId)));
      if (!unitRow) { res.status(400).json({ error: "Filial (unitId) inválida para esta organização" }); return; }
    }

    const [existingUser] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
    if (existingUser) {
      res.status(400).json({ error: "Este email já possui uma conta na plataforma" });
      return;
    }

    const sendEmail = shouldSendSetPasswordEmail(password);
    const passwordHash = sendEmail ? null : await bcrypt.hash(password as string, 10);
    const normalizedModules = role === "org_admin" ? [] : modules;

    try {
      let setPasswordToken: string | null = null;
      const createdUser = await db.transaction(async (tx) => {
        const [user] = await tx.insert(usersTable).values({
          name: name.toUpperCase(),
          email,
          passwordHash,
          organizationId: orgId,
          role,
          unitId,
        }).returning();

        if (normalizedModules.length > 0) {
          await tx.insert(userModulePermissionsTable).values(
            normalizedModules.map((module: AppModule) => ({ userId: user.id, module })),
          );
        }

        if (sendEmail) {
          setPasswordToken = crypto.randomBytes(32).toString("hex");
          await tx.insert(passwordResetTokensTable).values({
            userId: user.id,
            token: setPasswordToken,
            expiresAt: new Date(Date.now() + SET_PASSWORD_TOKEN_TTL_MS),
          });
        }

        return user;
      });

      // E-mail enviado após o commit: a conta fica consistente mesmo se o envio
      // falhar — o admin reenvia via "Reenviar e-mail de acesso".
      let emailSent = true;
      if (setPasswordToken) {
        emailSent = await trySendSetPasswordEmail(
          buildSetPasswordUrl(setPasswordToken),
          email,
        );
      }

      res.status(201).json({ ...serializeOrgUser(createdUser, normalizedModules), emailSent });
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

// Reenvia o e-mail de definição de senha para um usuário que ainda não definiu
// a própria senha (passwordHash null). Para quem já tem senha, retorna 400.
router.post("/organizations/:orgId/users/:userId/resend-set-password-email",
  requireAuth,
  requireCompletedOnboarding,
  requireRole("org_admin"),
  async (req, res): Promise<void> => {
    const orgId = Number(req.params.orgId);
    const userId = Number(req.params.userId);

    if (orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const [user] = await db
      .select({ id: usersTable.id, email: usersTable.email, passwordHash: usersTable.passwordHash })
      .from(usersTable)
      .where(and(eq(usersTable.id, userId), eq(usersTable.organizationId, orgId)));

    if (!user) {
      res.status(404).json({ error: "Usuário não encontrado" });
      return;
    }

    if (user.passwordHash != null) {
      res.status(400).json({ error: "Este usuário já definiu uma senha" });
      return;
    }

    const token = await issueSetPasswordToken(user.id);
    const sent = await trySendSetPasswordEmail(buildSetPasswordUrl(token), user.email);
    if (!sent) {
      res.status(500).json({ error: "Não foi possível enviar o e-mail. Tente novamente." });
      return;
    }

    res.json({ message: "E-mail de definição de senha reenviado." });
  },
);

router.patch("/organizations/:orgId/users/:userId/role",
  requireAuth,
  requireCompletedOnboarding,
  requireRole("org_admin"),
  async (req, res): Promise<void> => {
    const orgId = Number(req.params.orgId);
    const userId = Number(req.params.userId);

    if (orgId !== req.auth!.organizationId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const parsedBody = z.object({
      role: z.enum(["operator", "analyst", "manager"]),
      unitId: z.number().int().nullable().optional(),
    }).safeParse(req.body);
    if (!parsedBody.success) { res.status(400).json({ error: "Payload inválido" }); return; }
    const { role, unitId } = parsedBody.data;
    if (role === "manager" && (unitId === null || unitId === undefined)) {
      res.status(400).json({ error: "Gerente requer uma filial (unitId)" });
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

    // Mantém a filial para qualquer papel: omitir unitId preserva a atual;
    // só zera quando o cliente envia unitId: null explicitamente.
    const nextUnitId = unitId === undefined ? user.unitId : unitId;
    if (nextUnitId !== null) {
      const [unitRow] = await db
        .select({ id: unitsTable.id })
        .from(unitsTable)
        .where(and(eq(unitsTable.id, nextUnitId), eq(unitsTable.organizationId, orgId)));
      if (!unitRow) {
        res.status(400).json({ error: "Filial (unitId) inválida para esta organização" });
        return;
      }
    }
    await db.update(usersTable).set({ role, unitId: nextUnitId }).where(eq(usersTable.id, userId));
    res.json({ message: "Cargo atualizado com sucesso" });
  }
);

router.put("/organizations/:orgId/users/:userId/modules",
  requireAuth,
  requireCompletedOnboarding,
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
