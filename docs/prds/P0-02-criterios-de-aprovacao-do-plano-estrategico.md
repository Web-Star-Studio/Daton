---
title: Critérios de aprovação do plano estratégico
suggested_slug: criterios-de-aprovacao-do-plano-estrategico
category: Governança
priority: P0
summary: Detalha as pendências impeditivas de aprovação do plano estratégico, incluindo complianceIssues, requisitos mínimos, geração de revisão formal e agendamento da próxima revisão.
source_files:
  - artifacts/api-server/src/routes/governance/plans.ts
  - artifacts/api-server/src/lib/governance.ts
---

# Critérios de aprovação do plano estratégico

## Visão geral

O sistema não aprova um plano estratégico apenas porque ele foi submetido. Antes da aprovação, o backend calcula pendências impeditivas de conformidade para verificar se o plano está suficientemente completo.

## Quando usar

Use este artigo quando a dúvida for:

- por que um plano não pôde ser aprovado
- quais campos e estruturas precisam existir antes da aprovação
- o que acontece automaticamente depois da aprovação

## Quem pode executar ou aprovar

- Usuários com escrita no módulo podem preparar o conteúdo e submeter o plano.
- Apenas `org_admin` aprova ou rejeita o plano.
- `platform_admin` tem acesso ampliado no contexto administrativo interno.

## Regras e estados do sistema

A aprovação só ocorre se o plano estiver em `in_review` e sem pendências impeditivas.

As mensagens de `complianceIssues` hoje incluem:

- `Plano sem aprovação vigente.`
- `Revisão periódica vencida.`
- `Ausência de itens SWOT.`
- `Existem itens SWOT sem conclusão de tratamento.`
- `Ausência de partes interessadas.`
- `Ausência de objetivos estratégicos.`
- `Avaliação de relevância de mudança climática não registrada.`
- `Há item SWOT que requer ação sem ação vinculada.`
- `Ausência de riscos e oportunidades avaliados.`
- `Existem riscos ou oportunidades sem avaliação completa.`
- `Há risco ou oportunidade que exige resposta sem ação vinculada.`
- `Existem riscos ou oportunidades com revisão vencida.`
- `Há risco ou oportunidade concluído sem verificação de eficácia.`
- `Há risco ou oportunidade com eficácia reprovada.`

## Fluxo passo a passo

1. O plano é submetido e entra em `in_review`.
2. O sistema monta o detalhe consolidado do plano.
3. O backend calcula os `complianceIssues`.
4. Se existir ao menos uma pendência impeditiva, a aprovação é bloqueada.
5. Se não houver pendências, o `org_admin` aprova o plano.
6. Na aprovação, o sistema cria uma revisão formal com snapshot do plano.
7. O sistema gera automaticamente um documento de evidência da revisão.
8. O plano recebe nova revisão ativa, `approvedAt`, `nextReviewAt` e limpeza dos lembretes anteriores.

## Exceções, bloqueios e erros comuns

- Submeter o plano não elimina pendências; ele apenas muda o estado para revisão.
- Itens SWOT sem decisão de tratamento impedem a aprovação.
- Riscos e oportunidades sem owner, likelihood, impact ou responseStrategy são considerados incompletos.
- Estratégias de resposta que exigem ação precisam de ação vinculada, exceto casos tratados como monitoramento ou aceite.
- Um risco ou oportunidade em `awaiting_effectiveness` sem revisão de eficácia mantém o plano com pendência.
- Se a revisão periódica já estiver vencida, o plano segue com impedimento até regularização.

## Relação com outros módulos

- A aprovação cria revisão no módulo de Governança.
- A aprovação cria um documento em Documentação com PDF da revisão.
- O documento de evidência pode ser vinculado a unidades impactadas pelas ações e pelos riscos/oportunidades.

## Limites atuais

- O sistema valida a estrutura mínima e as pendências impeditivas que já estão codificadas hoje.
- O Daton AI pode listar e explicar esses critérios, mas não altera campos, não remove pendências e não aprova o plano automaticamente.
- Regras organizacionais não implementadas no backend não entram neste checklist oficial.
