# Deployment

This repo is set up for:

- API on Render
- Postgres on Neon
- Object storage on Cloudflare R2
- Transactional email on Resend
- Frontend on Cloudflare Pages

## 1. Neon

Create a Neon Postgres database and copy its pooled connection string into `DATABASE_URL`.

Requirements:

- Use SSL in the connection string.
- Keep the database external to Render. This repo already uses standard Postgres via Drizzle.

## 2. Cloudflare R2

Create one R2 bucket and an API token with read/write access to that bucket.

Set these API env vars on Render:

- `S3_REGION=auto`
- `S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`
- `S3_ACCESS_KEY_ID=<r2-access-key-id>`
- `S3_SECRET_ACCESS_KEY=<r2-secret-access-key>`
- `PRIVATE_OBJECT_DIR=/<bucket-name>/private`
- `PUBLIC_OBJECT_SEARCH_PATHS=/<bucket-name>/public`

Notes:

- The backend now uses an S3-compatible adapter, so it is not tied to Replit object storage.
- `PRIVATE_OBJECT_DIR` and `PUBLIC_OBJECT_SEARCH_PATHS` keep the existing path convention used by the app.

## 3. Resend

Create a Resend API key and verify the sending domain.

Set these env vars on Render:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

Example:

- `RESEND_FROM_EMAIL=Daton <noreply@yourdomain.com>`

## 4. Render API Service

This repo includes a Render Blueprint at [render.yaml](/Users/webstar/Documents/projects/Daton-replit/render.yaml).

Create a new Render Blueprint or Web Service from the repo and set:

- Build command: `corepack enable && pnpm install --frozen-lockfile && pnpm --filter @workspace/api-server build`
- Start command: `node artifacts/api-server/dist/index.cjs`

Required Render env vars:

- `DATABASE_URL`
- `JWT_SECRET`
- `APP_BASE_URL`
- `CORS_ALLOWED_ORIGINS`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `AI_INTEGRATIONS_OPENAI_API_KEY`
- `AI_INTEGRATIONS_OPENAI_BASE_URL=https://api.openai.com/v1`
- `S3_REGION=auto`
- `S3_ENDPOINT`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `PRIVATE_OBJECT_DIR`
- `PUBLIC_OBJECT_SEARCH_PATHS`

Recommended:

- Point a custom API domain such as `api.yourdomain.com` to Render.
- Set `APP_BASE_URL` to the frontend domain, for example `https://app.yourdomain.com`.
- Set `CORS_ALLOWED_ORIGINS` to a comma-separated list of allowed frontend origins, including your main Pages domain and any preview Pages domains you want to use.

## 5. Cloudflare Pages Frontend

Create a Cloudflare Pages project for the repo.

Use these settings:

- Root directory: repository root
- Build command: `corepack enable && pnpm install --frozen-lockfile && pnpm --filter @workspace/web build`
- Build output directory: `artifacts/web/dist/public`

Set this Pages build env var:

- `VITE_API_BASE_URL=https://api.yourdomain.com`

Notes:

- The frontend now supports a separate API origin through `VITE_API_BASE_URL`.
- [artifacts/web/public/\_redirects](/Users/webstar/Documents/projects/Daton-replit/artifacts/web/public/_redirects) enables SPA route fallback on Pages.

## 6. Drizzle Schema Push

Run this against the Neon database before first launch:

```bash
pnpm --filter @workspace/db push
```

If you need seed data:

```bash
pnpm --filter @workspace/scripts seed
```

## 7. Domains

Recommended layout:

- Frontend: `app.yourdomain.com` on Cloudflare Pages
- API: `api.yourdomain.com` on Render

This keeps the app portable:

- Neon is standard Postgres
- R2 is S3-compatible object storage
- Resend is used directly via API key
- Render and Cloudflare Pages can be swapped later without changing the app model
