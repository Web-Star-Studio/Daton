import { Router, type IRouter } from "express";
import crypto from "crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, usersTable, passwordResetTokensTable } from "@workspace/db";
import bcrypt from "bcryptjs";
import { getResendClient } from "../lib/resend";

const router: IRouter = Router();

const requestResetBodySchema = z.object({
  email: z.string().trim().email(),
});

function getAppBaseUrl(req: { headers: Record<string, string | string[] | undefined> }): string {
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL.replace(/\/$/, "");
  }
  const rawHost = req.headers["x-forwarded-host"] || req.headers["host"];
  const host = (Array.isArray(rawHost) ? rawHost[0] : rawHost)?.split(",")[0]?.trim();
  if (host) return `https://${host}`;
  return "http://localhost:3000";
}

function buildPasswordResetEmailHtml(resetUrl: string): string {
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
                Redefinição de senha
              </h1>
              <p style="margin:0 0 8px 0;font-size:15px;color:#6b6b6b;line-height:1.6;">
                Recebemos uma solicitação para redefinir a senha da sua conta no Daton.
              </p>
              <p style="margin:0 0 28px 0;font-size:15px;color:#6b6b6b;line-height:1.6;">
                Clique no botão abaixo para criar uma nova senha. O link é válido por <strong style="color:#1a1a1a;">1 hora</strong>.
              </p>
              <a href="${resetUrl}" style="display:inline-block;padding:12px 32px;background-color:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;">
                Redefinir senha
              </a>
              <p style="margin:24px 0 0 0;font-size:13px;color:#9a9a9a;line-height:1.5;">
                Se você não solicitou a redefinição de senha, ignore este e-mail. Sua senha permanece inalterada.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #f0f0f0;">
              <p style="margin:0;font-size:12px;color:#b0b0b0;line-height:1.5;">
                Este é um e-mail automático. Por favor, não responda.
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

router.post("/auth/password-reset/request", async (req, res): Promise<void> => {
  const parsed = requestResetBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email } = parsed.data;

  // Always respond generically — never reveal whether the email exists
  const genericResponse = { message: "Se o e-mail estiver cadastrado, você receberá um link de redefinição em breve." };

  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
  if (!user) {
    res.json(genericResponse);
    return;
  }

  // Invalidate any existing unused tokens for this user
  await db
    .update(passwordResetTokensTable)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResetTokensTable.userId, user.id), isNull(passwordResetTokensTable.usedAt)));

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.insert(passwordResetTokensTable).values({
    userId: user.id,
    token,
    expiresAt,
  });

  const resetUrl = `${getAppBaseUrl(req)}/auth/redefinir-senha?token=${token}`;

  try {
    const { client, fromEmail } = await getResendClient();
    await client.emails.send({
      from: fromEmail,
      to: email,
      subject: "Redefinição de senha — Daton",
      html: buildPasswordResetEmailHtml(resetUrl),
    });
  } catch (e) {
    console.error("Failed to send password reset email:", e);
    // Still respond generically to not reveal information
  }

  res.json(genericResponse);
});

const confirmResetBodySchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(6, "A senha deve ter no mínimo 6 caracteres"),
  confirmPassword: z.string().min(1),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
});

function findValidToken(token: string) {
  return db
    .select()
    .from(passwordResetTokensTable)
    .where(
      and(
        eq(passwordResetTokensTable.token, token),
        isNull(passwordResetTokensTable.usedAt),
        gt(passwordResetTokensTable.expiresAt, new Date()),
      ),
    )
    .limit(1);
}

router.get("/auth/password-reset/validate/:token", async (req, res): Promise<void> => {
  const { token } = req.params;
  const [record] = await findValidToken(token);
  if (!record) {
    res.status(400).json({ error: "Link inválido ou expirado." });
    return;
  }
  res.json({ valid: true });
});

router.post("/auth/password-reset/confirm", async (req, res): Promise<void> => {
  const parsed = confirmResetBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? parsed.error.message });
    return;
  }

  const { token, newPassword } = parsed.data;

  const [record] = await findValidToken(token);
  if (!record) {
    res.status(400).json({ error: "Link inválido ou expirado." });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await db
    .update(usersTable)
    .set({ passwordHash })
    .where(eq(usersTable.id, record.userId));

  // Mark this token and any other pending tokens as used
  await db
    .update(passwordResetTokensTable)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResetTokensTable.userId, record.userId), isNull(passwordResetTokensTable.usedAt)));

  res.json({ message: "Senha redefinida com sucesso." });
});

export default router;
