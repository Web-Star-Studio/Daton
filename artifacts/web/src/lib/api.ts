const RAW_API_BASE_URL =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL
    ? String(import.meta.env.VITE_API_BASE_URL).trim()
    : "";

export function getApiBaseUrl(): string {
  return RAW_API_BASE_URL.replace(/\/$/, "");
}

export function resolveApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const apiBaseUrl = getApiBaseUrl();

  if (!apiBaseUrl) {
    return normalizedPath;
  }

  return `${apiBaseUrl}${normalizedPath}`;
}

export function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("daton_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}
