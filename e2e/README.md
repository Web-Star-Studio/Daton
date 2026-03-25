# Playwright E2E

Os testes E2E são separados da suíte de integração do Vitest.

- `pnpm test:integration` cobre testes de integração do backend com Postgres/MinIO locais.
- `pnpm test:e2e` cobre fluxos completos da aplicação via Playwright.

Local setup:

`playwright.config.ts` loads `.env` and will fail fast unless `DATABASE_URL` and `JWT_SECRET` are already set. Set them before running the Docker, `pnpm`, or Playwright commands.

Example `.env` snippet:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/daton
JWT_SECRET=daton-local-dev-secret
```

If you are not using a local `.env`, export them in your shell first:

```bash
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/daton
export JWT_SECRET=daton-local-dev-secret
```

Then run:

```bash
docker compose up -d postgres
pnpm --filter @workspace/db push
pnpm exec playwright install chromium
pnpm test:e2e
```

Useful commands:

```bash
pnpm test:e2e
pnpm test:e2e:headed
pnpm test:e2e:ui
```

Notes:

- The suite starts the API on `3001` and the web app on `4173`.
- `playwright.config.ts` also derives `APP_BASE_URL`, `CORS_ALLOWED_ORIGINS`, `API_PROXY_TARGET`, and `VITE_API_BASE_URL` internally from those base settings, but the required external inputs are `DATABASE_URL` and `JWT_SECRET`.
- Tests create isolated org-admin records with an `E2E` prefix and clean them up through the database after each fixture-backed test.
- Phase 1 intentionally avoids Resend-dependent invitation delivery and file upload flows.
