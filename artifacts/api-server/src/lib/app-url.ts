/**
 * Resolve the public base URL of the web app for building links sent by e-mail
 * (password reset, set-password on user creation, invitations).
 *
 * Prefers the explicit APP_BASE_URL env (set in production), then the proxy's
 * forwarded host, then the request host, and finally a localhost fallback.
 */
export function getAppBaseUrl(req: {
  headers: Record<string, string | string[] | undefined>;
}): string {
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL.replace(/\/$/, "");
  }
  const rawHost = req.headers["x-forwarded-host"] || req.headers["host"];
  const host = (Array.isArray(rawHost) ? rawHost[0] : rawHost)
    ?.split(",")[0]
    ?.trim();
  if (host) return `https://${host}`;
  return "http://localhost:3000";
}
