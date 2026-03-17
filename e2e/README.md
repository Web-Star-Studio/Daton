# Playwright E2E

Local setup:

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
- Tests create isolated org-admin records with an `E2E` prefix and clean them up through the database after each fixture-backed test.
- Phase 1 intentionally avoids Resend-dependent invitation delivery and file upload flows.
