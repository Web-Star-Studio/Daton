# Repository Guidelines

## Project Structure & Module Organization
This repo is a `pnpm` workspace monorepo. App code lives in `artifacts/`: `artifacts/web` for the React + Vite frontend, `artifacts/api-server` for the Express API, and `artifacts/mockup-sandbox` for isolated UI work. Shared packages live in `lib/`, including `lib/db` (Drizzle schema and DB access), `lib/api-spec` (OpenAPI source), and generated consumers such as `lib/api-zod` and `lib/api-client-react`. End-to-end tests live in `e2e/`. Static frontend assets belong in `artifacts/web/public`. Utility and seed scripts live in `scripts/`.

## Build, Test, and Development Commands
Use `pnpm` only; the root `preinstall` blocks `npm` and `yarn`.

- `pnpm install`: install all workspace dependencies.
- `pnpm build`: run workspace typechecks, then build all packages/apps with a build script.
- `pnpm typecheck`: run TypeScript checks across libs, apps, scripts, and `e2e`.
- `pnpm --filter @workspace/web dev`: start the frontend locally.
- `pnpm --filter @workspace/api-server dev`: start the API server with `tsx`.
- `pnpm test:e2e`: run Playwright end-to-end tests.
- `pnpm test:e2e:ui`: open Playwright UI mode for local debugging.
- `pnpm --filter @workspace/db push`: push Drizzle schema changes.
- `pnpm --filter @workspace/api-spec codegen`: regenerate API contracts after editing `lib/api-spec/openapi.yaml`.

## Coding Style & Naming Conventions
TypeScript is the default, with `noImplicitAny` and `strictNullChecks` enabled in `tsconfig.base.json`. Follow Prettier formatting: 2-space indentation, double quotes, and trailing commas where supported. Use `PascalCase` for React components, `camelCase` for variables and functions, `use-*.ts(x)` for hooks, and lowercase route/schema filenames such as `routes/organizations.ts`.

Do not hand-edit generated files under `lib/api-client-react/src/generated` or `lib/api-zod/src/generated`; regenerate them instead.

## Testing Guidelines
Playwright is the active test runner for E2E coverage. Keep tests in `e2e/` with clear scenario-oriented names. Before opening a PR, at minimum run `pnpm typecheck` and the relevant local app flow; run `pnpm test:e2e` when your change affects integrated behavior. E2E runs require `DATABASE_URL` and `JWT_SECRET`; copy the root `.env.example` to `.env`, use your local development database connection string plus a local JWT secret, and export those variables or keep them in `.env` before running `pnpm test:e2e`. See `e2e/README.md` for the expected values and examples.

## Commit & Pull Request Guidelines
Recent commits use short, imperative summaries, sometimes prefixed with a task reference, for example `Task #4: Add checkbox selection...`. Keep commits focused and descriptive.

PRs should summarize the user-visible change, link the related task or issue, note schema or API updates, and include screenshots or recordings for frontend work. Call out any required environment variables or migration steps for reviewers.
