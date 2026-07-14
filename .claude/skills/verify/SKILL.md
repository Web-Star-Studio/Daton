---
name: verify
description: Como subir o Daton localmente e dirigir a UI para observar uma mudança rodando (sem tocar em produção)
---

# Verificar uma mudança no Daton

## Regra de ouro

A porta **3001 é o backend de dev do usuário e aponta para a Neon de PRODUÇÃO**.
Nunca suba nada nela, nunca escreva por ela. Use `:3002` para a API de teste.

## Banco

Três bancos convivem:

| Banco | Onde | Uso |
|---|---|---|
| Neon (`.env` → `DATABASE_URL`) | nuvem | **PRODUÇÃO**. Só leitura, e só quando pedido. |
| `daton-postgres-1` | docker `:5432` | dev local do usuário. Schema pode estar atrasado; não rode `db push` nele sem avisar. |
| `daton_integration` | docker `:55432` | descartável, schema completo. **Use este.** |

⚠️ `pnpm test:integration:up` reaproveita o nome de projeto `daton` do compose e
**recria o container de dev**. Se rodar, restaure depois com `docker compose -f docker-compose.yml up -d`.
O banco de integração geralmente já está de pé num container de worktree
(`feat-*-postgres-1` em `:55432`) — cheque com `docker ps` antes.

## Subir

```bash
# API em :3002 contra o banco de integração
cd artifacts/api-server
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55432/daton_integration" \
JWT_SECRET="verify-jwt-secret" PORT=3002 \
APP_BASE_URL="http://localhost:5199" CORS_ALLOWED_ORIGINS="http://localhost:5199" \
pnpm exec tsx src/index.ts
```

```bash
# Web em :5199. VITE_API_BASE_URL NÃO leva /api — os paths gerados já incluem.
cd artifacts/web
VITE_API_BASE_URL="http://localhost:3002" pnpm exec vite --port 5199 --strictPort
```

Saúde: `curl http://localhost:3002/api/healthz` → `{"status":"ok"}`.

## Usuários de teste

Não existe rota `/login` — o formulário está em `/`. Senha via `bcrypt.hash(pass, 10)`.
Semeie org + usuários direto no banco (`organizations`, `users`, `user_module_permissions`);
`onboarding_status` precisa ser `'completed'` ou o app trava no onboarding.

Para exercitar permissões, crie um `org_admin` (ignora módulos), um `operator` com um
subconjunto e outro com o módulo em teste.

## Dirigir

`playwright-cli` precisa de `--browser=chromium` (o `chrome` do sistema não está instalado):

```bash
playwright-cli -s=verify open --browser=chromium http://localhost:5199/
playwright-cli -s=verify snapshot --filename=x.yaml   # grava na CWD, não em .playwright-cli/
playwright-cli -s=verify eval "() => location.pathname"   # precisa ser arrow function
playwright-cli -s=verify localstorage-clear               # é assim que se desloga
```

Refs vêm do snapshot (`[ref=e123]`). Cheque se o alvo é `button` ou `link` — "Ver plano"
em Suas Pendências é `link`, não `button`.

## Fluxos que valem dirigir

- **Permissões de módulo:** logar como operador sem o módulo → item some da sidebar;
  rota direta redireciona para `/organizacao`. Logar como `org_admin` →
  `/configuracoes/sistema` → "Configurar permissões" → marcar → Salvar → confirmar
  o `PUT .../users/:id/modules` 200 e a linha em `user_module_permissions`.
- **Suas Pendências:** o CTA "Ver plano" leva a `/planos-acao/:id`. Se um guard novo
  bloquear o prefixo, esse botão morre. Sempre teste clicando.

## Ruído conhecido (não é regressão)

- `GET /organizations/:id/users` responde **403 para operadores** (exige `org_admin`/`manager`
  + módulo `kpi`). Aparece como 2 erros de console em telas que usam `useListOrgUsers`.
- `pnpm typecheck` falha em `scripts/src/migrate/gabardo-513-report.ts` (falta `exceljs`/`xlsx`).
- A suíte `web-unit` estoura a heap neste ambiente; arquivos passam individualmente.
