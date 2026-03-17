export const API_BASE_URL =
  process.env.PLAYWRIGHT_API_BASE_URL || "http://127.0.0.1:3001";
export const WEB_BASE_URL =
  process.env.PLAYWRIGHT_WEB_BASE_URL || "http://127.0.0.1:4173";
export const WEB_ORIGIN = new URL(WEB_BASE_URL).origin;
