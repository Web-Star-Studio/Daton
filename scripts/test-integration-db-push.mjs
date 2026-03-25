import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const envPath = path.join(rootDir, ".env.integration");

if (!fs.existsSync(envPath)) {
  console.error(
    "Missing .env.integration. Copy .env.integration.example before running integration DB setup.",
  );
  process.exit(1);
}

process.loadEnvFile(envPath);
process.env.TEST_ENV = "integration";

const child = spawn("pnpm", ["--filter", "@workspace/db", "push"], {
  cwd: rootDir,
  env: process.env,
  shell: true,
  stdio: "inherit",
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
