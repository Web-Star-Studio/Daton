# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Daton is an ESG, quality management and compliance platform (ISO 9001:2015 focused). It is a **pnpm workspace monorepo** with applications in `artifacts/` and shared libraries in `lib/`.

**Language:** TypeScript throughout. **Package manager:** pnpm (enforced; yarn/npm blocked).

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
```

No test runner is currently configured. All changes must pass `pnpm typecheck`.

## Architecture: Code Generation Pipeline

The OpenAPI spec at `lib/api-spec/openapi.yaml` is the **single source of truth** for API contracts. Orval generates:
- Zod validation schemas → `lib/api-zod/src/generated/`
- React Query hooks → `lib/api-client-react/src/generated/`

**Never manually edit generated files.** After changing the OpenAPI spec, run `pnpm --filter @workspace/api-spec codegen` to regenerate.

## Architecture: Database

- Drizzle ORM with PostgreSQL (Neon in production)
- Schema files live in `lib/db/src/schema/` and are re-exported from `lib/db/src/schema/index.ts`
- Uses `drizzle-kit push` (not migrations) to sync schema to the database
- Multi-tenant: most tables have an `organization_id` foreign key

## Architecture: Authentication & Authorization

- JWT-based auth (7-day expiry), token stored client-side as `daton_token`
- Roles: `platform_admin`, `org_admin`, `operator`, `analyst` (analyst = read-only)
- Module-level permissions: `documents`, `legislations`, `employees`, `units`, `departments`, `positions`
- Server-side middleware enforces role + module access per organization
- Frontend: `AuthContext` wraps protected routes

## Architecture: Frontend

- React 19 + Vite 7 + TailwindCSS 4
- Routing: Wouter (lightweight). Routes under `/organizacao` and `/qualidade/...`
- Data fetching: TanStack React Query via generated hooks from `@workspace/api-client-react`
- Forms: React Hook Form + Zod
- UI primitives: Radix UI with shadcn/ui patterns + CVA for variants
- Auth token injected into fetch via `Authorization: Bearer` header (`artifacts/web/src/lib/api.ts`)

## Architecture: Storage

- Cloudflare R2 (S3-compatible) for file storage
- Frontend uses Uppy for direct uploads via presigned URLs
- Server generates presigned URLs and enforces ACLs (`objectAcl.ts`)
- Private vs public paths controlled by `PRIVATE_OBJECT_DIR` / `PUBLIC_OBJECT_SEARCH_PATHS` env vars

## Deployment

- **API:** Render (Node 22). Build: `pnpm --filter @workspace/api-server build` → `node artifacts/api-server/dist/index.cjs`. Health check: `/api/healthz`
- **Frontend:** Render (static site). Output: `artifacts/web/dist/public`. SPA fallback via `_redirects`
- **Database:** Neon PostgreSQL (SSL required)
- **Object Storage:** Cloudflare R2 (S3-compatible)
- **Email:** Resend

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
