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
- **legislations**: id, title, number, description, tipoNorma, emissor, level, uf, municipality, macrotema, subtema, applicability, publicationDate, sourceUrl, applicableArticles, reviewFrequencyDays, observations, generalObservations, tags (jsonb string[]), organizationId. **Note: status is NOT stored per legislation — it belongs to unit_legislations only.**
- **unit_legislations**: id, unitId, legislationId, complianceStatus (conforme/nao_conforme/parcialmente_conforme/nao_avaliado), notes, evidenceUrl, evaluatedAt, evaluatedBy
- **evidence_attachments**: id, unitLegislationId, fileName, fileSize, contentType, objectPath, uploadedAt — file evidence attached to compliance evaluations, stored via GCS presigned URL upload
- **conversations**: id, userId, organizationId, title, createdAt — AI chat conversations per user/org
- **messages**: id, conversationId, role (user/assistant), content, createdAt — chat messages within conversations
- **questionnaire_themes**: id, code, name, description, sortOrder — global questionnaire theme categories (e.g., "Instalações")
- **questionnaire_questions**: id, themeId, code, questionNumber, text, type (single_select/multi_select/text), options (jsonb), tags (jsonb mapping answer→tag[]), conditionalOn, conditionalValue, sortOrder — questions within themes
- **unit_questionnaire_responses**: id, unitId, questionId, answer (jsonb), respondedAt — unit-specific questionnaire answers
- **unit_compliance_tags**: id, unitId, tag, sourceQuestionId, createdAt — compliance tags generated from questionnaire answers, used to filter legislation lists

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
│   ├── integrations-openai-ai-server/  # OpenAI SDK client (via Replit AI Integrations)
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
- GET/POST /api/organizations/:orgId/legislations/:legId/units/:unitId/attachments — List/create evidence attachments
- DELETE /api/organizations/:orgId/legislations/:legId/units/:unitId/attachments/:attachmentId — Remove attachment
- GET /api/organizations/:orgId/questionnaire/themes — List questionnaire themes with questions
- GET /api/organizations/:orgId/units/:unitId/questionnaire/responses — Get unit's saved answers
- PUT /api/organizations/:orgId/units/:unitId/questionnaire/responses — Save/update answers
- POST /api/organizations/:orgId/units/:unitId/questionnaire/submit — Submit questionnaire, generates compliance tags
- GET /api/organizations/:orgId/units/:unitId/questionnaire/tags — Get unit's compliance tags
- POST /api/storage/uploads/request-url — Request presigned upload URL (GCS)
- GET /api/storage/objects/* — Serve uploaded objects
- GET /api/ai/conversations — List user's AI conversations
- POST /api/ai/conversations — Create new conversation
- GET /api/ai/conversations/:convId/messages — Get conversation messages
- POST /api/ai/conversations/:convId/messages — Send message (SSE streaming response, AI with DB query tool)

## Frontend Routes

- / and /auth — Login/register page (split layout: left image panel, right form panel)
- /app/qualidade/legislacoes — Legislations list with filters, create dialog, CSV import
- /app/qualidade/legislacoes/:id — Legislation detail with unit compliance tracking
- /app/organizacao/unidades — Units management (minimalist cards, clickable)
- /app/organizacao/unidades/:id — Unit detail with inline editing + compliance questionnaire modal

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
- Seed data includes 8 real Brazilian environmental legislations, 3 units, and 30 questionnaire questions in "Instalações" theme
- Legislations table has a `tags` (jsonb text array) column for tag-based filtering. When filtering by unit, the system uses PostgreSQL array overlap (case-insensitive) between the legislation's `tags` and the unit's compliance tags. Matched tags are returned in the API response as `matchedTags` and displayed as green badges on the frontend.
- Unit profiling questionnaire generates compliance tags from answers; legislation list supports filtering by unit (unitId query param) using tag intersection
- AI assistant (Daton AI) uses OpenAI via Replit AI Integrations (gpt-4o-mini). System prompt in Portuguese describing the platform schema. Read-only DB query tool with $ORG_ID placeholder for multi-tenant isolation. SSE streaming for real-time responses. Chat panel in AppLayout header (Sparkles icon).
