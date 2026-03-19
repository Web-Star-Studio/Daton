---
title: Planejamento estratégico: ciclo de vida do plano
suggested_slug: planejamento-estrategico-ciclo-de-vida-do-plano
category: Governança
priority: P0
summary: Explica como o plano estratégico percorre os estados draft, in_review, approved, rejected, overdue e archived, quem pode editar, submeter, aprovar e reabrir o plano.
source_files:
  - artifacts/api-server/src/routes/governance/plans.ts
  - artifacts/api-server/src/lib/governance.ts
---

# Planejamento estratégico: ciclo de vida do plano

## Visão geral

O módulo de Governança mantém o planejamento estratégico dentro do sistema com trilha auditável. O plano possui um ciclo de vida explícito e só muda de estado por regras controladas no backend.

## Quando usar

Use este fluxo quando a organização precisar:

- criar um novo plano estratégico
- revisar um plano já existente
- submeter o plano para aprovação
- aprovar, rejeitar ou reabrir o plano
- acompanhar quando a revisão periódica ficou vencida

## Quem pode executar ou aprovar

- Usuários com acesso ao módulo de Governança e permissão de escrita podem criar, editar e submeter planos quando o estado permitir.
- `org_admin` pode aprovar, rejeitar e reabrir planos.
- `platform_admin` bypassa validações de papel no contexto interno da plataforma.
- `analyst` possui apenas leitura e não executa transições de escrita.

## Regras e estados do sistema

Os estados relevantes do plano são:

- `draft`: estado inicial do plano e estado para edição normal
- `in_review`: plano submetido para análise e bloqueado para edição operacional
- `approved`: plano aprovado com revisão formal vigente
- `rejected`: plano devolvido para ajustes
- `overdue`: plano com revisão periódica vencida
- `archived`: plano arquivado e fora do ciclo ativo

Regras importantes:

- O sistema considera editável apenas o plano em `draft` ou `rejected`.
- A submissão só é aceita para planos em `draft` ou `rejected`.
- A aprovação só é aceita para planos em `in_review`.
- A rejeição só é aceita para planos em `in_review`.
- A reabertura só é aceita para planos em `approved`, `overdue` ou `rejected`.
- A organização só deve manter um plano ativo por vez no conjunto `draft`, `in_review`, `approved`, `rejected` e `overdue`.
- Quando a data de `nextReviewAt` expira, o plano pode ser tratado como `overdue`.

## Fluxo passo a passo

1. Criar ou importar o plano.
2. Preencher o conteúdo estrutural do módulo, como SWOT, partes interessadas, objetivos, ações e riscos/oportunidades.
3. Manter o plano em `draft` enquanto o conteúdo estiver em elaboração.
4. Submeter o plano, o que muda o estado para `in_review`.
5. O `org_admin` analisa o conteúdo e decide entre aprovar ou rejeitar.
6. Se aprovado, o plano passa para `approved`, gera revisão formal e agenda a próxima revisão.
7. Se rejeitado, o plano passa para `rejected` e volta para ajustes.
8. Se a revisão periódica vencer, o plano pode aparecer como `overdue`.
9. Se for necessário alterar um plano aprovado, vencido ou rejeitado, o `org_admin` reabre o plano e o estado volta para `draft`.

## Exceções, bloqueios e erros comuns

- Um plano em `approved` não pode ser editado diretamente; primeiro ele precisa ser reaberto.
- Um plano em `draft` não pode ser aprovado sem passar por `in_review`.
- Um plano em `in_review` não deve ser tratado como versão final enquanto a aprovação não for concluída.
- Um plano com revisão vencida pode gerar alertas e entrar em `overdue`.
- Aprovação e reabertura dependem de `org_admin`; usuários operacionais não concluem essas etapas.

## Relação com outros módulos

- A aprovação do plano gera revisão formal no próprio módulo de Governança.
- A aprovação também gera um documento de evidência no módulo de Documentação.
- Ações e riscos/oportunidades podem se relacionar com unidades da organização.
- Notificações são usadas para lembrar revisões futuras e vencidas.

## Limites atuais

- O Daton AI pode explicar o fluxo, mas não cria, aprova, rejeita ou reabre planos por conta própria.
- O comportamento operacional depende dos estados persistidos no sistema, não de interpretações livres do usuário.
- O artigo cobre o ciclo do plano estratégico implementado hoje, não processos externos de governança fora da plataforma.
