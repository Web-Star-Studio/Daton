import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "artifacts/web/src"),
      "@assets": path.resolve(rootDir, "attached_assets"),
    },
  },
  test: {
    globals: true,
    include: [
      "artifacts/**/tests/**/*.test.{ts,tsx}",
      "lib/**/tests/**/*.test.{ts,tsx}",
      "tests/**/*.test.{ts,tsx}",
    ],
    setupFiles: ["./tests/setup/env.ts", "./tests/setup/web.ts"],
    environmentMatchGlobs: [
      ["artifacts/web/tests/**/*.test.{ts,tsx}", "jsdom"],
    ],
    sequence: {
      concurrent: false,
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "output/vitest/coverage",
    },
  },
});
