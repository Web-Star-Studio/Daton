const rawBasePath = typeof import.meta !== "undefined" && import.meta.env?.BASE_URL
  ? String(import.meta.env.BASE_URL)
  : "/";

export const APP_BASE_PATH = rawBasePath.replace(/\/$/, "") || "";

export function resolveAppAssetPath(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${APP_BASE_PATH}${normalizedPath}`;
}
