import { Router, type IRouter } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { eq, and, gt } from "drizzle-orm";
import { db, usersTable, organizationsTable, invitationsTable, userModulePermissionsTable } from "@workspace/db";
import { CreateInvitationBody, AcceptInvitationBody } from "@workspace/api-zod";
import { requireAuth, requireCompletedOnboarding, requireRole, signToken, APP_MODULES } from "../middlewares/auth";
import type { AppModule, UserRole } from "../middlewares/auth";
import { getResendClient } from "../lib/resend";

const router: IRouter = Router();

function getAllowedHosts(): string[] {
  const hosts: string[] = [];
  if (process.env.APP_BASE_URL) {
    try { hosts.push(new URL(process.env.APP_BASE_URL).host); } catch {}
  }
  if (process.env.REPLIT_DEV_DOMAIN) hosts.push(process.env.REPLIT_DEV_DOMAIN);
  if (process.env.REPLIT_DEPLOYMENT) hosts.push(process.env.REPLIT_DEPLOYMENT);
  if (process.env.REPLIT_DOMAINS) {
    process.env.REPLIT_DOMAINS.split(",").forEach(d => {
      const trimmed = d.trim();
      if (trimmed) hosts.push(trimmed);
    });
  }
  return hosts;
}

function getAppBaseUrl(req?: { headers: Record<string, string | string[] | undefined> }): string {
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL.replace(/\/$/, "");
  }
  if (req) {
    const rawHost = req.headers["x-forwarded-host"] || req.headers["host"];
    const host = (Array.isArray(rawHost) ? rawHost[0] : rawHost)?.split(",")[0]?.trim();
    const allowed = getAllowedHosts();
    if (host && (allowed.length === 0 || allowed.includes(host))) {
      return `https://${host}`;
    }
  }
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  return "http://localhost:3000";
}

function buildInviteEmailHtml(inviterName: string, orgName: string, acceptUrl: string): string {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f7;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;">
          <!-- Logo -->
          <tr>
            <td style="padding:32px 40px 24px 40px;">
              <span style="font-size:24px;font-weight:700;color:#1a1a1a;letter-spacing:-0.5px;">daton</span>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:0 40px 32px 40px;">
              <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:600;color:#1a1a1a;line-height:1.3;">
                Você foi convidado para o Daton
              </h1>
              <p style="margin:0 0 8px 0;font-size:15px;color:#6b6b6b;line-height:1.6;">
                <strong style="color:#1a1a1a;">${inviterName}</strong> convidou você para fazer parte da organização <strong style="color:#1a1a1a;">${orgName}</strong> no Daton.
              </p>
              <p style="margin:0 0 28px 0;font-size:15px;color:#6b6b6b;line-height:1.6;">
                Clique no botão abaixo para aceitar o convite e criar sua conta.
              </p>
              <a href="${acceptUrl}" style="display:inline-block;padding:12px 32px;background-color:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;">
                Aceitar convite
              </a>
              <p style="margin:24px 0 0 0;font-size:13px;color:#9a9a9a;line-height:1.5;">
                Este convite expira em 7 dias. Se você não reconhece este convite, ignore este email.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #f0f0f0;">
              <p style="margin:0;font-size:12px;color:#b0b0b0;line-height:1.5;">
                Este é um email automático. Por favor, não responda.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

router.post("/invitations", requireAuth, requireCompletedOnboarding, requireRole("org_admin"), async (req, res): Promise<void> => {
  const parsed = CreateInvitationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const {
    email,
    role = "analyst",
    modules = [],
  } = parsed.data;
  const { userId, organizationId } = req.auth!;

  const validRoles: UserRole[] = ["org_admin", "operator", "analyst"];
  if (!validRoles.includes(role as UserRole)) {
    res.status(400).json({ error: "Cargo inválido" });
    return;
  }

  if (!Array.isArray(modules) || modules.some((module) => !APP_MODULES.includes(module as AppModule))) {
    res.status(400).json({ error: "Módulos inválidos" });
    return;
  }

  const normalizedModules = role === "org_admin" ? [] : modules;

  const [existingUser] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existingUser) {
    res.status(400).json({ error: "Este email já possui uma conta na plataforma" });
    return;
  }

  const now = new Date();
  const [existingInvite] = await db.select().from(invitationsTable).where(
    and(
      eq(invitationsTable.email, email),
      eq(invitationsTable.organizationId, organizationId),
      eq(invitationsTable.status, "pending"),
      gt(invitationsTable.expiresAt, now),
    ),
  );
  if (existingInvite) {
    res.status(400).json({ error: "Já existe um convite pendente para este email" });
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [inviter] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, organizationId));

  const acceptUrl = `${getAppBaseUrl(req)}/convite/${token}`;

  try {
    const { client, fromEmail } = await getResendClient();
    await client.emails.send({
      from: fromEmail || "Daton <noreply@daton.app>",
      to: email,
      subject: `${inviter.name} convidou você para o Daton`,
      html: buildInviteEmailHtml(inviter.name, org.name, acceptUrl),
    });
  } catch (e) {
    console.error("Failed to send invitation email:", e);
    res.status(500).json({ error: "Falha ao enviar email de convite" });
    return;
  }

  const [invitation] = await db.insert(invitationsTable).values({
    email,
    organizationId,
    invitedBy: userId,
    role,
    modules: normalizedModules,
    token,
    status: "pending",
    expiresAt,
  }).returning();

  res.status(201).json({
    id: invitation.id,
    email: invitation.email,
    status: invitation.status,
    invitedByName: inviter.name,
    organizationName: org.name,
    role: invitation.role,
    modules: invitation.modules ?? [],
    expiresAt: invitation.expiresAt.toISOString(),
    createdAt: invitation.createdAt.toISOString(),
  });
});

router.get("/invitations", requireAuth, requireCompletedOnboarding, requireRole("org_admin"), async (req, res): Promise<void> => {
  const { organizationId } = req.auth!;

  const invitations = await db.select({
    id: invitationsTable.id,
    email: invitationsTable.email,
    status: invitationsTable.status,
    role: invitationsTable.role,
    modules: invitationsTable.modules,
    invitedByName: usersTable.name,
    expiresAt: invitationsTable.expiresAt,
    createdAt: invitationsTable.createdAt,
  })
    .from(invitationsTable)
    .innerJoin(usersTable, eq(invitationsTable.invitedBy, usersTable.id))
    .where(eq(invitationsTable.organizationId, organizationId))
    .orderBy(invitationsTable.createdAt);

  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, organizationId));

  const now = new Date();
  const mapped = invitations.map((inv) => {
    let status = inv.status;
    if (status === "pending" && inv.expiresAt < now) {
      status = "expired";
    }
    return {
      id: inv.id,
      email: inv.email,
      status,
      invitedByName: inv.invitedByName,
      organizationName: org.name,
      role: inv.role,
      modules: inv.modules ?? [],
      expiresAt: inv.expiresAt.toISOString(),
      createdAt: inv.createdAt.toISOString(),
    };
  });

  res.json({ invitations: mapped });
});

router.delete("/invitations/:invitationId", requireAuth, requireCompletedOnboarding, requireRole("org_admin"), async (req, res): Promise<void> => {
  const { organizationId } = req.auth!;
  const invitationId = Number(req.params.invitationId);

  const [invitation] = await db.select().from(invitationsTable).where(
    and(
      eq(invitationsTable.id, invitationId),
      eq(invitationsTable.organizationId, organizationId),
    ),
  );

  if (!invitation) {
    res.status(404).json({ error: "Convite não encontrado" });
    return;
  }

  if (invitation.status !== "pending") {
    res.status(400).json({ error: "Apenas convites pendentes podem ser revogados" });
    return;
  }

  await db.update(invitationsTable)
    .set({ status: "revoked" })
    .where(eq(invitationsTable.id, invitationId));

  res.json({ message: "Convite revogado com sucesso" });
});

router.delete("/invitations/:invitationId/permanent", requireAuth, requireCompletedOnboarding, requireRole("org_admin"), async (req, res): Promise<void> => {
  const { organizationId } = req.auth!;
  const invitationId = Number(req.params.invitationId);

  const [invitation] = await db.select().from(invitationsTable).where(
    and(
      eq(invitationsTable.id, invitationId),
      eq(invitationsTable.organizationId, organizationId),
    ),
  );

  if (!invitation) {
    res.status(404).json({ error: "Convite não encontrado" });
    return;
  }

  if (invitation.status === "pending") {
    res.status(400).json({ error: "Convites pendentes devem ser revogados primeiro" });
    return;
  }

  await db.delete(invitationsTable).where(eq(invitationsTable.id, invitationId));
  res.sendStatus(204);
});

router.get("/invitations/accept/:token", async (req, res): Promise<void> => {
  const { token } = req.params;

  const [invitation] = await db.select().from(invitationsTable).where(
    and(
      eq(invitationsTable.token, token),
      eq(invitationsTable.status, "pending"),
    ),
  );

  if (!invitation) {
    res.status(400).json({ error: "Convite inválido ou já utilizado" });
    return;
  }

  if (invitation.expiresAt < new Date()) {
    res.status(400).json({ error: "Este convite expirou" });
    return;
  }

  const [inviter] = await db.select().from(usersTable).where(eq(usersTable.id, invitation.invitedBy));
  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, invitation.organizationId));

  res.json({
    email: invitation.email,
    organizationName: org.name,
    invitedByName: inviter.name,
  });
});

router.post("/invitations/accept/:token", async (req, res): Promise<void> => {
  const { token } = req.params;

  const parsed = AcceptInvitationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, password } = parsed.data;

  try {
    type AcceptInvitationError = { error: string; status: number };
    type AcceptInvitationSuccess = {
      user: {
        id: number;
        name: string;
        email: string;
        organizationId: number;
        role: string;
        createdAt: string;
      };
      token: string;
    };

    const result = await db.transaction<AcceptInvitationError | AcceptInvitationSuccess>(async (tx) => {
      const [invitation] = await tx.select().from(invitationsTable).where(
        and(
          eq(invitationsTable.token, token),
          eq(invitationsTable.status, "pending"),
        ),
      );

      if (!invitation) {
        return { error: "Convite inválido ou já utilizado", status: 400 };
      }

      if (invitation.expiresAt < new Date()) {
        return { error: "Este convite expirou", status: 400 };
      }

      const [existingUser] = await tx.select().from(usersTable).where(eq(usersTable.email, invitation.email));
      if (existingUser) {
        return { error: "Este email já possui uma conta na plataforma", status: 400 };
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const [user] = await tx.insert(usersTable).values({
        name,
        email: invitation.email,
        passwordHash,
        organizationId: invitation.organizationId,
        role: invitation.role ?? "analyst",
      }).returning();

      const invitedModules = invitation.role === "org_admin" ? [] : (invitation.modules ?? []);
      if (invitedModules.length > 0) {
        await tx.insert(userModulePermissionsTable).values(
          invitedModules.map((module) => ({ userId: user.id, module })),
        );
      }

      await tx.update(invitationsTable)
        .set({ status: "accepted" })
        .where(eq(invitationsTable.id, invitation.id));

      const authToken = signToken({ userId: user.id, organizationId: user.organizationId, role: user.role as any });

      return {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          organizationId: user.organizationId,
          role: user.role,
          createdAt: user.createdAt.toISOString(),
        },
        token: authToken,
      };
    });

    if ("error" in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.status(201).json(result);
  } catch (e: any) {
    if (e?.code === "23505") {
      res.status(400).json({ error: "Este email já possui uma conta na plataforma" });
      return;
    }
    console.error("Failed to accept invitation:", e);
    res.status(500).json({ error: "Erro interno ao aceitar convite" });
  }
});

export default router;
