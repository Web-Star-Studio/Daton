# Daton

Daton is a `pnpm` workspace monorepo for the Daton platform.

It currently includes:

- `artifacts/web`: the main React + Vite frontend
- `artifacts/api-server`: the Express 5 API server
- `artifacts/mockup-sandbox`: a separate UI sandbox
- `lib/*`: shared packages for database access, API contracts, OpenAI integrations, and object storage helpers
- `scripts`: workspace scripts such as seeding utilities

## Tech Stack

- TypeScript across the entire repo
- React 19 + Vite for frontend apps
- Express 5 for the API
- Drizzle ORM for database access and schema management
- Playwright for end-to-end tests
- PostgreSQL + S3-compatible object storage for local and production data

## Repository Structure

```text
artifacts/
  api-server/
  mockup-sandbox/
  web/
lib/
  api-client-react/
  api-spec/
  api-zod/
  db/
  integrations-openai-ai-react/
  integrations-openai-ai-server/
  object-storage-web/
scripts/
e2e/
```

## Prerequisites

- Node.js 20+
- `pnpm`
- Docker (recommended for local PostgreSQL and MinIO)

This repo only supports `pnpm`. The root `preinstall` script blocks `npm` and `yarn`.

## Getting Started

1. Install dependencies:

```bash
pnpm install
```

2. Create your local environment file:

```bash
cp .env.example .env
```

3. Start local infrastructure:

```bash
docker compose up -d
```

This starts:

- PostgreSQL on `localhost:5432`
- MinIO on `localhost:9000`
- MinIO Console on `localhost:9001`

4. Update `.env` as needed for your local setup.

For a simple local setup, the repo's existing `.env` expects:

- PostgreSQL at `postgresql://postgres:postgres@localhost:5432/daton`
- MinIO credentials `minioadmin` / `minioadmin`

5. Push the database schema:

```bash
pnpm --filter @workspace/db push
```

6. Optionally seed local data:

```bash
pnpm --filter @workspace/scripts seed
```

## Development

Run the main frontend:

```bash
pnpm --filter @workspace/web dev
```

Run the API server:

```bash
pnpm --filter @workspace/api-server dev
```

Run the mockup sandbox:

```bash
pnpm --filter @workspace/mockup-sandbox dev
```

## Common Commands

Install dependencies:

```bash
pnpm install
```

Run all type checks:

```bash
pnpm typecheck
```

Build the workspace:

```bash
pnpm build
```

Run end-to-end tests:

```bash
pnpm test:e2e
```

Run Playwright in UI mode:

```bash
pnpm test:e2e:ui
```

Regenerate API code from OpenAPI:

```bash
pnpm --filter @workspace/api-spec codegen
```

## Environment Variables

The main variables are documented in [`.env.example`](./.env.example).

Important groups:

- API/runtime: `PORT`, `DATABASE_URL`, `JWT_SECRET`
- frontend/API connectivity: `APP_BASE_URL`, `CORS_ALLOWED_ORIGINS`, `VITE_API_BASE_URL`
- email: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- OpenAI integrations: `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`
- storage: `S3_*`, `PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS`

## Notes

- Generated API files live under `lib/api-client-react/src/generated` and `lib/api-zod/src/generated`. Regenerate them instead of editing them manually.
- Additional deployment details live in [`DEPLOYMENT.md`](./DEPLOYMENT.md).
