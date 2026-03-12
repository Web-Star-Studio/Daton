# Daton — ESG, Quality & Compliance Platform

## Overview

Multi-tenant SaaS platform for ESG, quality, compliance, and operations management. Built in Portuguese (pt-BR). Current focus: SGQ (Sistema de Gestão de Qualidade) module with "Legislações" submodule, ISO 14001 compliant. Apple HIG-inspired minimal design.

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite + Tailwind CSS + wouter (routing) + React Query
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Auth**: JWT (bcryptjs + jsonwebtoken), token stored in localStorage as `daton_token`
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Auth & Multi-Tenancy

- Login: POST /api/auth/login with {email, password} → returns {user, token}
- Register: POST /api/auth/register with {razaoSocial, nomeFantasia?, cnpj?, adminName, email, password}
- JWT_SECRET stored as environment secret
- Token injected automatically by `lib/api-client-react/src/custom-fetch.ts` for same-origin requests only
- Each user belongs to one organization (tenant); all data queries are scoped by orgId
- Seed credentials: admin@demo.com / demo123 (org: "Empresa Demo LTDA")

## Database Schema

- **organizations**: id, name (razão social), nomeFantasia, cnpj, timestamps
- **users**: id, name, email, passwordHash, organizationId, role
- **units**: id, name, code, type (sede/filial), cnpj, status (ativa/inativa), cep, address, streetNumber, neighborhood, city, state, country, phone, organizationId
- **legislations**: id, title, number, description, tipoNorma, emissor, level, uf, municipality, macrotema, subtema, applicability, publicationDate, sourceUrl, applicableArticles, reviewFrequencyDays, observations, generalObservations, organizationId. **Note: status is NOT stored per legislation — it belongs to unit_legislations only.**
- **unit_legislations**: id, unitId, legislationId, complianceStatus (conforme/nao_conforme/parcialmente_conforme/nao_avaliado), notes, evidenceUrl, evaluatedAt, evaluatedBy

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server (port 8080)
│   ├── web/                # React Vite frontend
│   └── mockup-sandbox/     # Component preview server
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks + custom-fetch
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## API Routes

- POST /api/auth/register — Create org + user
- POST /api/auth/login — Login, returns JWT
- POST /api/auth/logout — Logout
- GET /api/auth/me — Current user + org info
- GET /api/organizations/:orgId — Get org details
- GET/POST /api/organizations/:orgId/units — List/create units
- GET/PATCH/DELETE /api/organizations/:orgId/units/:unitId — Unit CRUD
- GET/POST /api/organizations/:orgId/legislations — List/create legislations (supports search, level, status query params)
- POST /api/organizations/:orgId/legislations/import — CSV import (must be before /:legId routes)
- GET/PATCH/DELETE /api/organizations/:orgId/legislations/:legId — Legislation CRUD
- GET/POST /api/organizations/:orgId/legislations/:legId/units — List/assign unit compliance
- PATCH/DELETE /api/organizations/:orgId/legislations/:legId/units/:unitId — Update/remove compliance

## Frontend Routes

- / and /auth — Login/register page (split layout: left image panel, right form panel)
- /app/qualidade/legislacoes — Legislations list with filters, create dialog, CSV import
- /app/qualidade/legislacoes/:id — Legislation detail with unit compliance tracking
- /app/organizacao/unidades — Units management (minimalist cards, clickable)
- /app/organizacao/unidades/:id — Unit detail with inline editing

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

- **Always typecheck from the root** — run `pnpm run typecheck`
- **`emitDeclarationOnly`** — only `.d.ts` files during typecheck; JS bundling by esbuild/tsx/vite
- **Project references** — when package A depends on B, A's `tsconfig.json` must list B in `references`

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly`

## Key Implementation Notes

- Legislation levels: federal, estadual, municipal, internacional
- Legislation statuses: vigente, revogada, alterada
- Compliance statuses: conforme, nao_conforme, parcialmente_conforme, nao_avaliado
- CSV import route must be registered BEFORE /:legId routes in Express to avoid conflicts
- custom-fetch only injects auth tokens for same-origin requests (security measure)
- Seed data includes 8 real Brazilian environmental legislations and 3 units
