---
title: Modelo de acesso do Daton
suggested_slug: modelo-de-acesso-do-daton
category: Organização
priority: P2
summary: Explica os papéis platform_admin, org_admin, operator e analyst, o controle por módulos, o bloqueio de escrita para analyst e como tenancy e authVersion afetam o acesso.
source_files:
  - artifacts/api-server/src/middlewares/auth.ts
  - artifacts/web/src/contexts/AuthContext.tsx
  - artifacts/api-server/src/routes/org-users.ts
---

# Modelo de acesso do Daton

## Visão geral

O Daton usa um modelo de acesso baseado em tenant, papel e módulo. O acesso efetivo depende da organização do usuário, do role atribuído e, em alguns casos, dos módulos liberados.

## Quando usar

Use este artigo quando a dúvida for:

- diferença entre `platform_admin`, `org_admin`, `operator` e `analyst`
- por que um usuário vê um módulo e outro não
- por que um usuário autenticado ficou sem acesso depois de uma mudança organizacional

## Quem pode executar ou aprovar

Papéis atuais:

- `platform_admin`: acesso interno ampliado e bypass de checagens de role e módulo
- `org_admin`: administração da organização, inclusive usuários e módulos
- `operator`: operação com escrita nos módulos liberados
- `analyst`: leitura nos módulos liberados

## Regras e estados do sistema

- O token carrega `userId`, `organizationId`, `role`, `organizationAuthVersion` e `onboardingStatus`.
- Se `authVersion` ou `onboardingStatus` da organização mudarem, o token fica obsoleto e o usuário precisa relogar.
- `org_admin` bypassa checagem de módulo, mas não de tenant.
- `analyst` não passa por `requireWriteAccess`.
- Os módulos controláveis hoje incluem `documents`, `legislations`, `employees`, `units`, `departments`, `positions` e `governance`.

## Fluxo passo a passo

1. O usuário autentica e recebe token JWT.
2. O backend valida o token e o estado atual da organização.
3. O sistema verifica se o usuário pertence ao tenant correto.
4. O sistema verifica role e, quando necessário, acesso por módulo.
5. Em operações de escrita, o sistema bloqueia `analyst`.

## Exceções, bloqueios e erros comuns

- Usuário autenticado pode perder acesso se o estado da organização mudar.
- Ter conta válida não significa ter acesso a todos os módulos.
- `org_admin` não depende de lista de módulos para operar a organização.
- `platform_admin` é um papel interno, não equivalente a usuário comum da organização.

## Relação com outros módulos

- O modelo de acesso afeta Governança, Documentação, Legislações, Colaboradores e módulos organizacionais.
- O onboarding da organização também interfere na liberação dos módulos.

## Limites atuais

- O Daton AI pode explicar o modelo de acesso, mas não altera papéis, módulos ou tokens.
- O artigo cobre apenas as regras de acesso já implementadas no backend.
