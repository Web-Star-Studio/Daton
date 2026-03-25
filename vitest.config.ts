import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, defineProject } from "vitest/config";
import react from "@vitejs/plugin-react";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const alias = {
  "@": path.resolve(rootDir, "artifacts/web/src"),
  "@assets": path.resolve(rootDir, "attached_assets"),
};
const sharedProjectConfig = {
  plugins: [react()],
  resolve: {
    alias,
  },
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias,
  },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "output/vitest/coverage",
      include: [
        "artifacts/**/src/**/*.{ts,tsx}",
        "lib/**/src/**/*.{ts,tsx}",
        "scripts/**/*.{ts,tsx,mjs}",
      ],
      exclude: [
        "**/*.d.ts",
        "**/*.test.{ts,tsx}",
        "**/dist/**",
        "**/public/**",
        "**/coverage/**",
        "**/node_modules/**",
        "artifacts/mockup-sandbox/**",
        "artifacts/web/src/main.tsx",
        "artifacts/web/src/App.tsx",
        "e2e/**",
        "lib/api-client-react/src/generated/**",
        "lib/api-zod/src/generated/**",
        "output/**",
        "tests/**",
      ],
    },
    projects: [
      defineProject({
        ...sharedProjectConfig,
        extends: true,
        test: {
          name: "web-unit",
          globals: true,
          sequence: {
            concurrent: false,
          },
          include: ["artifacts/web/tests/**/*.unit.test.{ts,tsx}"],
          environment: "jsdom",
          setupFiles: ["./tests/setup/env.ts", "./tests/setup/web.ts"],
        },
      }),
      defineProject({
        ...sharedProjectConfig,
        extends: true,
        test: {
          name: "node-unit",
          globals: true,
          sequence: {
            concurrent: false,
          },
          include: [
            "artifacts/**/tests/**/*.unit.test.ts",
            "lib/**/tests/**/*.unit.test.ts",
            "tests/**/*.unit.test.ts",
          ],
          exclude: ["artifacts/web/tests/**"],
          environment: "node",
          setupFiles: ["./tests/setup/env.ts"],
        },
      }),
      defineProject({
        ...sharedProjectConfig,
        extends: true,
        test: {
          name: "integration",
          globals: true,
          sequence: {
            concurrent: false,
          },
          include: [
            "artifacts/**/tests/**/*.integration.test.ts",
            "lib/**/tests/**/*.integration.test.ts",
            "tests/**/*.integration.test.ts",
          ],
          environment: "node",
          setupFiles: ["./tests/setup/env.ts"],
        },
      }),
    ],
  },
});
