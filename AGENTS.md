# Repository Guidelines

## Project Structure & Module Organization
This repository is a `pnpm` workspace monorepo. Main applications live in `artifacts/`: `artifacts/web` is the React + Vite frontend, `artifacts/api-server` is the Express 5 API, and `artifacts/mockup-sandbox` is a UI sandbox. Shared packages live in `lib/`, including `lib/db` for Drizzle schema and database access, `lib/api-spec` for the OpenAPI source, `lib/api-zod` and `lib/api-client-react` for generated contracts, and OpenAI/storage helpers. Utility scripts live in `scripts/src`. Frontend static assets belong in `artifacts/web/public`.

## Build, Test, and Development Commands
Use `pnpm` only; the root `preinstall` blocks `npm` and `yarn`.

- `pnpm install`: install all workspace dependencies.
- `pnpm build`: run workspace typechecks, then build all packages/apps with a build script.
- `pnpm typecheck`: run TypeScript checks across libs, apps, and scripts.
- `pnpm --filter @workspace/web dev`: start the web app locally.
- `pnpm --filter @workspace/api-server dev`: start the API server with `tsx`.
- `pnpm --filter @workspace/db push`: push Drizzle schema changes to the database.
- `pnpm --filter @workspace/api-spec codegen`: regenerate API client and Zod files from `lib/api-spec/openapi.yaml`.
- `pnpm --filter @workspace/scripts seed`: run local seed data.

## Coding Style & Naming Conventions
TypeScript is the default across the repo, with strict null and implicit-any checks enabled in `tsconfig.base.json`. Follow the existing Prettier style: 2-space indentation, double quotes, and trailing commas where supported. Use `PascalCase` for React components and context providers, `camelCase` for variables/functions, and existing filename patterns by area: route/schema files are lowercase (`routes/organizations.ts`, `schema/unit-legislations.ts`), hooks use the `use-*.ts(x)` pattern, and page files stay route-oriented (`pages/app/.../[id].tsx`).

Avoid manual edits to generated files under `lib/api-client-react/src/generated` and `lib/api-zod/src/generated`; regenerate them instead.

## Testing Guidelines
There is no test runner or coverage gate configured yet. For now, every change should at minimum pass `pnpm typecheck` and the local app build or manual smoke flow. When adding tests later, place them beside the feature or in a nearby `tests` directory and use `*.test.ts` or `*.spec.ts` naming.

## Commit & Pull Request Guidelines
Recent commits follow short, imperative summaries, sometimes prefixed with a task reference, for example `Task #4: Add checkbox selection...` or `Allow users to permanently delete canceled invitations`. Keep commits focused and descriptive.

Pull requests should explain the user-visible change, note any schema/API updates, link the related task or issue, and include screenshots or recordings for frontend changes. Call out any required environment variables such as `DATABASE_URL`, Resend, or OpenAI settings when they affect setup or review.
