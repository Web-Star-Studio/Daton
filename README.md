# Daton

<p align="center">
  <img src="./artifacts/web/public/images/daton-logo.png" alt="Logo do Daton" width="120" />
</p>

<p align="center">
  Plataforma ESG e SGQ para estruturar organizações, governança, documentação, conformidade e operação em um único monorepo.
</p>

<p align="center">
  <a href="#visao-geral">Visão geral</a> •
  <a href="#stack">Stack</a> •
  <a href="#estrutura-do-monorepo">Estrutura</a> •
  <a href="#como-rodar-localmente">Setup local</a> •
  <a href="#comandos-principais">Comandos</a> •
  <a href="#testes">Testes</a>
</p>

## Visão Geral

O Daton é um monorepo `pnpm` com a aplicação web, a API e bibliotecas compartilhadas da plataforma.

Hoje o produto cobre fluxos como:

- autenticação, onboarding e administração da organização;
- unidades, departamentos, cargos e colaboradores;
- legislação e conformidade por unidade;
- documentação do SGQ, anexos, aprovação e distribuição;
- governança estratégica, riscos e oportunidades, auditorias e não conformidades;
- gestão de fornecedores;
- integrações com OpenAI, e-mail transacional e armazenamento de objetos.

## Stack

- `TypeScript` em todo o workspace
- `React 19` + `Vite` no frontend
- `Express 5` na API
- `Drizzle ORM` para schema e acesso ao PostgreSQL
- `Playwright` para testes end-to-end
- `PostgreSQL`, `MinIO`/S3 compatível, `Resend` e integrações OpenAI

## Estrutura Do Monorepo

```text
artifacts/
  api-server/        # API Express
  mockup-sandbox/    # sandbox isolado para UI
  web/               # aplicação React + Vite
lib/
  api-client-react/  # cliente React Query gerado a partir do OpenAPI
  api-spec/          # fonte OpenAPI
  api-zod/           # contratos Zod gerados
  db/                # schema e acesso ao banco com Drizzle
  integrations-openai-ai-react/
  integrations-openai-ai-server/
  object-storage-web/
scripts/             # seed, criação de admins e utilitários
e2e/                 # testes Playwright
docs/                # documentação complementar
```

## Como Rodar Localmente

### Pré-requisitos

- `Node.js 20+`
- `pnpm`
- `Docker` para PostgreSQL e MinIO local

> [!IMPORTANT]
> Este repositório suporta apenas `pnpm`. O script de `preinstall` bloqueia `npm` e `yarn`.

### 1. Instale as dependências

```bash
pnpm install
```

### 2. Configure o ambiente

```bash
cp .env.example .env
```

Variáveis mínimas para desenvolvimento local:

```bash
PORT=3001
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/daton
JWT_SECRET=daton-local-dev-secret
VITE_API_BASE_URL=http://localhost:3001
```

### 3. Suba a infraestrutura local

```bash
docker compose up -d
```

Isso inicia:

- PostgreSQL em `localhost:5432`
- MinIO em `localhost:9000`
- Console do MinIO em `localhost:9001`

### 4. Aplique o schema

```bash
pnpm --filter @workspace/db push
```

### 5. Popule dados iniciais opcionais

```bash
pnpm --filter @workspace/scripts seed
```

Se precisar criar usuários administrativos manualmente:

```bash
pnpm --filter @workspace/scripts create-org-admin
pnpm --filter @workspace/scripts create-platform-admin
```

## Desenvolvimento

Suba os serviços principais em terminais separados:

```bash
pnpm --filter @workspace/api-server dev
pnpm --filter @workspace/web dev
```

O sandbox visual pode ser iniciado separadamente:

```bash
pnpm --filter @workspace/mockup-sandbox dev
```

## Comandos Principais

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm test:unit
pnpm test:unit:coverage
pnpm test:integration
pnpm test:e2e
pnpm test:e2e:ui
pnpm test:e2e:headed
pnpm --filter @workspace/db push
pnpm --filter @workspace/api-spec codegen
```

## Testes

Os testes unitários usam Vitest com mocks explícitos e não dependem de banco.

Os testes de integração usam Vitest contra Postgres/MinIO locais e exigem `.env.integration`.

Fluxo mínimo para integração:

```bash
cp .env.integration.example .env.integration
pnpm test:integration:up
pnpm test:integration:db:push
pnpm test:integration
pnpm test:integration:down
```

Os testes E2E usam Playwright e continuam separados da suíte de integração. Eles exigem `DATABASE_URL` e `JWT_SECRET` definidos antes da execução.

Fluxo mínimo:

```bash
docker compose up -d postgres
pnpm --filter @workspace/db push
pnpm exec playwright install chromium
pnpm test:e2e
```

> [!NOTE]
> A suíte E2E sobe a API em `3001` e a aplicação web em `4173`. Os testes criam organizações isoladas com prefixo `E2E` e limpam os registros ao final.

## Variáveis De Ambiente

O arquivo [`.env.example`](./.env.example) documenta os valores esperados. Os grupos principais são:

- aplicação e autenticação: `PORT`, `DATABASE_URL`, `JWT_SECRET`
- frontend e CORS: `APP_BASE_URL`, `CORS_ALLOWED_ORIGINS`, `VITE_API_BASE_URL`
- e-mail: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- OpenAI: `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`, `OPENAI_ASSISTANT_MODEL`
- armazenamento: `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS`

## Geração De Contratos

O contrato da API fica em [`lib/api-spec/openapi.yaml`](./lib/api-spec/openapi.yaml). Depois de alterá-lo, regenere os consumidores:

```bash
pnpm --filter @workspace/api-spec codegen
```

> [!CAUTION]
> Não edite manualmente arquivos gerados em `lib/api-client-react/src/generated` ou `lib/api-zod/src/generated`.

## Deploy

O repositório já está estruturado para:

- API no Render
- banco no Neon
- frontend no Cloudflare Pages
- objetos no Cloudflare R2
- e-mails no Resend

Os detalhes operacionais estão em [`DEPLOYMENT.md`](./DEPLOYMENT.md).

## Observações

- O servidor inicia um scheduler de manutenção de governança no boot da API.
- O frontend usa `React Query`, `wouter` e uma camada compartilhada de contratos gerados.
- A especificação OpenAPI descreve os módulos principais da plataforma e serve de base para tipagem e consumo entre apps e libs.
