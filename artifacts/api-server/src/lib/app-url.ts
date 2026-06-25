/**
 * Resolve the public base URL of the web app for building links sent by e-mail
 * (password reset, set-password on user creation, invitations).
 *
 * Security: we deliberately DO NOT derive the base URL from request headers
 * (Host / X-Forwarded-Host), which are attacker-controllable and would allow
 * poisoning the links embedded in password-reset / set-password e-mails. We
 * rely on the explicit APP_BASE_URL env (required in production) and fall back
 * to localhost only for local development.
 */
export function getAppBaseUrl(): string {
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL.replace(/\/$/, "");
  }
  return "http://localhost:3000";
}
