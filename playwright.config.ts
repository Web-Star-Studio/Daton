const { defineConfig, devices } = require("@playwright/test");
const { existsSync, readFileSync } = require("node:fs");
const path = require("node:path");

const workspaceRoot = __dirname;

function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] ??= value;
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function withEnv(baseCommand: string, env: Record<string, string>): string {
  const exportedVars = Object.entries(env)
    .map(([key, value]) => `export ${key}=${shellQuote(value)}`)
    .join("; ");
  const shell = "/bin/sh";

  return `${shell} -lc ${shellQuote(`${exportedVars}; ${baseCommand}`)}`;
}

function parsePort(
  value: string | undefined,
  fallback: number,
  envName: string,
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (
    !Number.isFinite(parsed) ||
    !Number.isInteger(parsed) ||
    parsed < 1 ||
    parsed > 65_535
  ) {
    throw new Error(
      `${envName} must be an integer between 1 and 65535. Received: ${value}`,
    );
  }

  return parsed;
}

loadEnvFile(path.join(workspaceRoot, ".env"));

const apiPort = parsePort(process.env.E2E_API_PORT, 3001, "E2E_API_PORT");
const webPort = parsePort(process.env.E2E_WEB_PORT, 4173, "E2E_WEB_PORT");
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
const webBaseUrl = `http://127.0.0.1:${webPort}`;
const databaseUrl = process.env.DATABASE_URL;
const jwtSecret = process.env.JWT_SECRET;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL must be set before running Playwright E2E tests.",
  );
}

if (!jwtSecret) {
  throw new Error(
    "JWT_SECRET must be set before running Playwright E2E tests.",
  );
}

process.env.PLAYWRIGHT_API_BASE_URL = apiBaseUrl;
process.env.PLAYWRIGHT_WEB_BASE_URL = webBaseUrl;

module.exports = defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: process.env.CI ? 2 : 1,
  retries: process.env.CI ? 2 : 0,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  outputDir: "output/playwright/test-results",
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "output/playwright/report" }],
  ],
  use: {
    baseURL: webBaseUrl,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: withEnv("pnpm --filter @workspace/api-server dev", {
        DATABASE_URL: databaseUrl,
        JWT_SECRET: jwtSecret,
        PORT: String(apiPort),
        APP_BASE_URL: webBaseUrl,
        CORS_ALLOWED_ORIGINS: `${webBaseUrl},http://localhost:${webPort}`,
      }),
      url: `${apiBaseUrl}/api/healthz`,
      reuseExistingServer: false,
      timeout: 120_000,
      cwd: workspaceRoot,
    },
    {
      command: withEnv("pnpm --filter @workspace/web dev", {
        PORT: String(webPort),
        API_PROXY_TARGET: apiBaseUrl,
        BASE_PATH: "/",
        VITE_API_BASE_URL: "",
      }),
      url: `${webBaseUrl}/auth`,
      reuseExistingServer: false,
      timeout: 120_000,
      cwd: workspaceRoot,
    },
  ],
});
