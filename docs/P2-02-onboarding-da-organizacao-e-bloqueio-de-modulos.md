---
title: Onboarding da organização e bloqueio de módulos
suggested_slug: onboarding-da-organizacao-e-bloqueio-de-modulos
category: Organização
priority: P2
summary: Descreve como o onboarding da organização controla a liberação do produto, quais dados são gravados na conclusão, quando o authVersion é renovado e por que módulos ficam bloqueados enquanto o onboarding estiver pendente.
source_files:
  - artifacts/api-server/src/routes/organizations.ts
  - lib/db/src/schema/organizations.ts
  - artifacts/web/src/App.tsx
---

# Onboarding da organização e bloqueio de módulos

## Visão geral

No Daton, o onboarding não é apenas uma etapa visual. Ele faz parte do controle de acesso da organização e influencia a liberação dos módulos operacionais.

## Quando usar

Use este artigo quando a dúvida for:

- por que o usuário foi redirecionado para onboarding
- por que módulos continuam bloqueados após o cadastro inicial
- o que muda quando o onboarding é concluído ou reiniciado

## Quem pode executar ou aprovar

- O fluxo de conclusão e reinício do onboarding é restrito a `org_admin`.
- `platform_admin` não depende do onboarding para acessar a área administrativa interna.

## Regras e estados do sistema

Os estados principais são:

- `pending`
- `completed`
- `skipped`

Regras importantes:

- O registro inicial pode criar a organização com onboarding pendente.
- Enquanto a organização estiver em `pending`, a maior parte da aplicação fica bloqueada para usuários comuns.
- Concluir onboarding salva perfil da empresa e dados fiscais.
- Concluir ou reiniciar onboarding incrementa `authVersion`, invalidando tokens antigos.

## Fluxo passo a passo

1. A organização é criada.
2. O `org_admin` acessa o fluxo de onboarding.
3. O sistema coleta perfil da empresa e dados fiscais.
4. Ao concluir, o backend grava `onboardingData`, marca `completed`, registra `onboardingCompletedAt` e incrementa `authVersion`.
5. O usuário recebe novo token coerente com o estado atualizado.
6. Se o onboarding for reiniciado, a organização volta para `pending`, o token anterior perde validade e os módulos ficam bloqueados novamente.

## Exceções, bloqueios e erros comuns

- Não é possível concluir onboarding de organização em estado inadequado.
- Não é possível reiniciar onboarding antes de ele ter sido concluído.
- Alterações de onboarding invalidam sessões antigas por mudança de `authVersion`.
- O bloqueio de módulos é regra sistêmica, não apenas redirecionamento de interface.

## Relação com outros módulos

- O onboarding libera o uso de módulos como Organização, Governança, Documentação e Qualidade.
- O modelo de acesso e o token JWT dependem desse estado.

## Limites atuais

- O Daton AI pode explicar o bloqueio, mas não conclui nem reinicia onboarding por conta própria.
- O artigo cobre o controle de onboarding já codificado no backend e na navegação principal.
