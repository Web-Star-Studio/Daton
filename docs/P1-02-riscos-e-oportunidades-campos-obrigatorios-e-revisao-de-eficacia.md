---
title: Riscos e oportunidades: campos obrigatórios, estratégias de resposta e revisão de eficácia
suggested_slug: riscos-e-oportunidades-campos-obrigatorios-e-revisao-de-eficacia
category: Governança
priority: P1
summary: Explica como o sistema trata owner, likelihood, impact, responseStrategy, ações vinculadas, revisão periódica e verificação de eficácia em riscos e oportunidades do plano estratégico.
source_files:
  - artifacts/api-server/src/lib/governance.ts
---

# Riscos e oportunidades: campos obrigatórios, estratégias de resposta e revisão de eficácia

## Visão geral

O módulo de Governança trata riscos e oportunidades como parte auditável do plano estratégico. O item não é considerado plenamente avaliado apenas por existir; ele precisa de dados mínimos e pode exigir ação e revisão de eficácia.

## Quando usar

Use este artigo para entender:

- o que torna um risco ou oportunidade completo
- quando uma ação vinculada é obrigatória
- como o sistema deriva status operacionais
- quando a revisão de eficácia entra no fluxo

## Quem pode executar ou aprovar

- Usuários com escrita no módulo podem cadastrar e atualizar riscos e oportunidades enquanto o plano estiver editável.
- `org_admin` aprova o plano que contém esses itens.

## Regras e estados do sistema

Os itens trabalham com informações como:

- owner
- likelihood
- impact
- score
- responseStrategy
- nextReviewAt
- ações vinculadas
- revisão de eficácia

O sistema deriva estados operacionais a partir da combinação dos dados:

- `identified`
- `assessed`
- `responding`
- `awaiting_effectiveness`
- `effective`
- `ineffective`
- `continuous`
- `canceled`

Regras importantes:

- Sem owner, likelihood, impact ou responseStrategy, o item segue incompleto para fins de aprovação do plano.
- Estratégias de resposta diferentes de `monitor` e `accept` normalmente exigem ação vinculada.
- Item com ações abertas tende a aparecer como `responding`.
- Item sem ações abertas, mas já tratado, pode ir para `awaiting_effectiveness`.
- Revisão de eficácia pode levar o item a `effective` ou `ineffective`.

## Fluxo passo a passo

1. Cadastrar o risco ou oportunidade com título, descrição e origem.
2. Definir owner e, quando aplicável, unidade, objetivo e item SWOT relacionado.
3. Preencher likelihood, impact e responseStrategy.
4. Gerar ou vincular ações quando a estratégia exigir resposta operacional.
5. Acompanhar execução das ações.
6. Quando a resposta estiver concluída, revisar a eficácia.
7. Registrar resultado da eficácia como `effective` ou `ineffective`.
8. Manter `nextReviewAt` atualizado para evitar revisão vencida.

## Exceções, bloqueios e erros comuns

- Item sem avaliação completa bloqueia a aprovação do plano.
- Estratégia que exige ação sem ação vinculada gera pendência impeditiva.
- Item com revisão vencida continua impactando a conformidade do plano.
- Item em `awaiting_effectiveness` sem revisão de eficácia segue pendente.
- Resultado de eficácia reprovado mantém pendência de conformidade no plano.

## Relação com outros módulos

- Riscos e oportunidades podem se relacionar com objetivos, SWOT, ações e unidades.
- A aprovação do plano considera esse conjunto ao calcular `complianceIssues`.

## Limites atuais

- O Daton AI pode explicar os campos e os estados, mas não cadastra itens, não cria ações nem registra revisões de eficácia.
- A derivação de status segue a lógica implementada hoje, não uma taxonomia personalizada por organização.
- O artigo cobre o comportamento operacional já codificado no módulo de Governança.
