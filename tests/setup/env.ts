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

// Unit tests (TEST_ENV=unit) load no env file by design. Modules that import
// @workspace/db throw at import time without DATABASE_URL, so give them a
// local, unreachable default: unit tests never query — and if one ever does,
// it fails loudly against localhost instead of silently reaching production.
process.env.DATABASE_URL ??= "postgresql://unit:unit@127.0.0.1:5432/unit";
