export interface AuthEmail {
  subject: string;
  html: string;
}

/**
 * E-mail sent when an org admin creates a user without setting a password.
 * The recipient clicks the link to define their own password and then logs in.
 * The link reuses the password-reset confirmation flow and is valid for 24h.
 */
export function buildSetPasswordEmail(setPasswordUrl: string): AuthEmail {
  const html = `
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
                Bem-vindo(a) ao Daton
              </h1>
              <p style="margin:0 0 8px 0;font-size:15px;color:#6b6b6b;line-height:1.6;">
                Uma conta foi criada para você na plataforma Daton.
              </p>
              <p style="margin:0 0 28px 0;font-size:15px;color:#6b6b6b;line-height:1.6;">
                Clique no botão abaixo para definir sua senha e acessar o sistema. O link é válido por <strong style="color:#1a1a1a;">24 horas</strong>.
              </p>
              <a href="${setPasswordUrl}" style="display:inline-block;padding:12px 32px;background-color:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;">
                Definir minha senha
              </a>
              <p style="margin:24px 0 0 0;font-size:13px;color:#9a9a9a;line-height:1.5;">
                Se você não esperava este e-mail, ignore esta mensagem.
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

  return {
    subject: "Defina sua senha de acesso ao Daton",
    html,
  };
}
