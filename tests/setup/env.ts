import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const testEnv = process.env.TEST_ENV?.trim();
const envFileName =
  testEnv === "integration"
    ? ".env.integration"
    : testEnv === "unit"
      ? null
      : ".env";
const envPath = envFileName ? path.join(rootDir, envFileName) : null;

if (envPath && fs.existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

process.env.NODE_ENV ??= "test";
process.env.JWT_SECRET ??= "daton-test-jwt-secret";
