import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const envPath = path.join(rootDir, ".env");

if (fs.existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

process.env.NODE_ENV ??= "test";
process.env.JWT_SECRET ??= "daton-test-jwt-secret";
