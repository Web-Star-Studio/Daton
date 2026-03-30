# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Daton is an ESG, quality management and compliance platform (ISO 9001:2015 focused). It is a **pnpm workspace monorepo** with applications in `artifacts/` and shared libraries in `lib/`.

**Language:** TypeScript throughout. **Package manager:** pnpm (enforced; yarn/npm blocked by `preinstall` script).

## Workspace Layout

- `artifacts/web` — React + Vite frontend (`@workspace/web`)
- `artifacts/api-server` — Express 5 backend API (`@workspace/api-server`)
- `artifacts/mockup-sandbox` — UI component sandbox
- `lib/db` — Drizzle ORM schema and queries (`@workspace/db`)
- `lib/api-spec` — OpenAPI 3.1 specification (single source of truth for API contracts)
- `lib/api-zod` — Zod schemas generated from OpenAPI via Orval
- `lib/api-client-react` — React Query hooks generated from OpenAPI via Orval
- `lib/integrations-openai-ai-server` — OpenAI integration (server-side)
- `lib/integrations-openai-ai-react` — OpenAI integration (React hooks)
- `lib/object-storage-web` — Uppy-based S3/R2 file upload wrapper
- `scripts/` — Seed data and utility scripts
- `e2e/` — Playwright end-to-end tests
- `docs/prds` — Feature implementation plans (Product Requirement Documents)
- `docs/references` — Document references about the system's specs and requirements

## Common Commands

```bash
# Install
pnpm install

# Full build (typecheck all libs, then build all packages)
pnpm build

# Typecheck only
pnpm typecheck

# Dev servers
pnpm --filter @workspace/web dev          # Frontend (Vite, port 5173)
pnpm --filter @workspace/api-server dev   # Backend (Express, port 3001)

# Database schema push (Drizzle → Neon PostgreSQL)
pnpm --filter @workspace/db push
pnpm --filter @workspace/db push-force    # Destructive push

# Regenerate API client code from OpenAPI spec
pnpm --filter @workspace/api-spec codegen

# Seed data
pnpm --filter @workspace/scripts seed

# Tests
pnpm test:unit                # Vitest unit tests
pnpm test:unit:watch          # Vitest in watch mode
pnpm test:unit:coverage       # Vitest with v8 coverage
pnpm test:e2e                 # Playwright E2E tests
pnpm test:e2e:ui              # Playwright UI mode (local debugging)
pnpm test:e2e:headed          # Playwright headed browser

# Local infrastructure (PostgreSQL + MinIO)
docker compose up -d
```

```bash
# Run a single test file
pnpm exec vitest run path/to/file.test.ts

# Run tests by vitest project (web-unit, node-unit, integration)
pnpm exec vitest run --project node-unit

# Integration tests (require test DB)
pnpm test:integration:up          # Start test DB via docker-compose
pnpm test:integration             # Run integration suite
pnpm test:integration:down        # Tear down test DB
```

All changes must pass `pnpm typecheck`.

## Testing

### Unit Tests (Vitest)

- Config: `vitest.config.ts`. Three vitest projects: `web-unit` (JSDOM), `node-unit` (Node), `integration` (Node)
- Test files: `**/tests/**/*.test.{ts,tsx}` (unit) and `**/tests/**/*.integration.test.{ts,tsx}` (integration)
- Setup files: `tests/setup/env.ts`, `tests/setup/web.ts`
- Path aliases: `@` → `artifacts/web/src`, `@assets` → `attached_assets`
- Test helpers in `tests/support/backend.ts`: `createTestContext()` for isolated org+user setup, `createTestUser()`, `authHeader()`, plus factories for units, suppliers, departments, etc. All test data uses a unique prefix for cleanup isolation.

### E2E Tests (Playwright)

- Config: `playwright.config.ts`. Tests directory: `e2e/`
- Requires `DATABASE_URL` and `JWT_SECRET` in `.env` or exported
- Playwright auto-starts API on port 3001 and web app on port 4173
- Runs Chromium only; sequential execution (not parallel)
- Tests create isolated organizations with `E2E` prefix and clean up after themselves
- See `e2e/README.md` for setup details

## Local Development Setup

```bash
cp .env.example .env     # Then fill in DATABASE_URL, JWT_SECRET, VITE_API_BASE_URL
docker compose up -d     # PostgreSQL on :5432, MinIO on :9000 (console :9001)
pnpm --filter @workspace/db push   # Apply schema
pnpm --filter @workspace/scripts seed   # Optional: populate seed data
```

## Architecture: Code Generation Pipeline

The OpenAPI spec at `lib/api-spec/openapi.yaml` is the **single source of truth** for API contracts. Orval generates:
- Zod validation schemas → `lib/api-zod/src/generated/`
- React Query hooks → `lib/api-client-react/src/generated/`

Custom fetch mutator at `lib/api-client-react/src/custom-fetch.ts` handles auth token injection, API base URL, and error handling.

**Never manually edit generated files.** After changing the OpenAPI spec, run `pnpm --filter @workspace/api-spec codegen` to regenerate.

**Hand-written API clients** (`artifacts/web/src/lib/*-client.ts`) are used alongside Orval-generated hooks for complex domains (suppliers, governance, environmental). They provide custom type definitions, `apiJson<T>()` fetch wrappers, React Query key factories, and business logic that doesn't map cleanly to generated CRUD hooks. Use Orval-generated hooks for standard CRUD; use hand-written clients for complex queries, import/export workflows, or custom validation flows.

## Architecture: Database

- Drizzle ORM with PostgreSQL (Neon in production, Docker locally)
- Schema files live in `lib/db/src/schema/` and are re-exported from `lib/db/src/schema/index.ts`
- Uses `drizzle-kit push` (not migrations) to sync schema to the database
- Multi-tenant: most tables have an `organization_id` foreign key
- All tables include `createdAt` and `updatedAt` timestamps with timezone
- Zod integration via `drizzle-zod` (`createInsertSchema()`) for validation

## Architecture: Authentication & Authorization

- JWT-based auth (7-day expiry), token stored client-side as `daton_token` in localStorage
- Roles: `platform_admin`, `org_admin`, `operator`, `analyst` (analyst = read-only)
- Module-level permissions: `documents`, `legislations`, `employees`, `units`, `departments`, `positions`, `governance`, `suppliers`
- Server-side middleware enforces role + module access per organization with 30-second auth cache TTL
- Frontend: `AuthContext` wraps protected routes

## Architecture: Frontend

- React 19 + Vite 7 + TailwindCSS 4
- Routing: Wouter (lightweight). Routes under `/app/organizacao/`, `/app/qualidade/`, `/app/governanca/`, `/app/configuracoes/`
- Data fetching: TanStack React Query via generated hooks from `@workspace/api-client-react`
- Forms: React Hook Form + Zod
- UI primitives: Radix UI with shadcn/ui patterns (new-york preset) + CVA for variants
- Design language: Apple HIG-inspired (clean, minimal, light). See `docs/web/DESIGN_SYSTEM.md`
- Auth token injected into fetch via `Authorization: Bearer` header

## Architecture: API Server

- Express 5 with routes mounted at `/api`
- Error responses: `{ error: message }` with appropriate HTTP status codes
- Zod `.safeParse()` for request validation (400 on failure)
- Business logic is extracted from routes into `artifacts/api-server/src/services/` modules organized by domain (e.g., `services/suppliers/imports.ts`, `services/suppliers/catalog-sync.ts`). Routes import service functions to keep handlers focused on request/response.
- Governance scheduler starts automatically at boot for maintenance tasks
- esbuild bundling for production with allowlist packaging for cold-start optimization

## Architecture: Storage

- Cloudflare R2 (S3-compatible) for file storage
- Frontend uses Uppy for direct uploads via presigned URLs
- Server generates presigned URLs and enforces ACLs (`objectAcl.ts`)
- Private vs public paths controlled by `PRIVATE_OBJECT_DIR` / `PUBLIC_OBJECT_SEARCH_PATHS` env vars

## Coding Style

- Prettier: 2-space indentation, double quotes, trailing commas
- `PascalCase` for React components, `camelCase` for functions/variables
- Hook files: `use-*.ts(x)`
- Route/schema filenames: lowercase with hyphens (e.g., `unit-legislations.ts`)
- `cn()` utility (clsx + tailwind-merge) for conditional class names

## Deployment

- **API:** Render (Node 22). Build: `pnpm --filter @workspace/api-server build` → `node artifacts/api-server/dist/index.cjs`. Health check: `/api/healthz`
- **Frontend:** Cloudflare Pages. Build output: `artifacts/web/dist/public`. SPA fallback via `_redirects`
- **Database:** Neon PostgreSQL (SSL required)
- **Object Storage:** Cloudflare R2 (S3-compatible)
- **Email:** Resend

See `DEPLOYMENT.md` for full operational details.

## Key Environment Variables

**Backend required:** `DATABASE_URL`, `JWT_SECRET`, `APP_BASE_URL`, `CORS_ALLOWED_ORIGINS`
**Storage:** `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION=auto`, `PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS`
**Email:** `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
**AI:** `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`
**Frontend (build-time):** `VITE_API_BASE_URL`

## User Preferences

- I prefer iterative development, focusing on one feature or bug fix at a time. Please explain your thought process and proposed changes clearly before implementation. I value clean, readable code and comprehensive tests.
- Never stage, commit or push without being explicitly asked for
- Never start dev servers (frontend or backend) without being explicitly asked for
