---
title: Evidências e revisões no módulo de Governança
suggested_slug: evidencias-e-revisoes-no-modulo-de-governanca
category: Governança
priority: P1
summary: Mostra como a aprovação do plano estratégico gera revisão formal, snapshot auditável e documento de evidência no módulo de Documentação, incluindo vínculo com unidades impactadas.
source_files:
  - artifacts/api-server/src/lib/governance.ts
  - artifacts/api-server/src/routes/governance/plans.ts
---

# Evidências e revisões no módulo de Governança

## Visão geral

No Daton, aprovar um plano estratégico não apenas muda o status do plano. A aprovação gera revisão formal, snapshot auditável e um documento de evidência para registrar a versão aprovada.

## Quando usar

Use este artigo quando a dúvida envolver:

- o que é uma revisão formal do plano
- como a evidência documental é criada
- quais dados entram no snapshot e no PDF gerado
- como o sistema mantém trilha auditável após a aprovação

## Quem pode executar ou aprovar

- Usuários com escrita no módulo podem preparar o plano para revisão.
- Apenas `org_admin` conclui a aprovação que gera revisão e evidência.

## Regras e estados do sistema

- Cada aprovação bem-sucedida incrementa a revisão ativa do plano.
- A revisão armazena `revisionNumber`, `reason`, `changeSummary`, `approvedById`, `evidenceDocumentId` e um snapshot do detalhe do plano.
- O sistema também grava `approvedAt`, recalcula `nextReviewAt` e limpa os lembretes anteriores.
- O documento de evidência é criado com status `approved`, `sourceEntityType = strategic_plan` e `sourceEntityId` apontando para o plano.

## Fluxo passo a passo

1. O plano é aprovado sem pendências impeditivas.
2. O sistema consolida o detalhe do plano aprovado.
3. Um snapshot com os dados da revisão é salvo em `strategic_plan_revisions`.
4. O backend gera um PDF com resumo do plano, objetivos, partes interessadas, itens SWOT, riscos/oportunidades e ações.
5. O PDF é enviado ao storage e anexado a um documento criado automaticamente.
6. O documento recebe metadados de origem do plano estratégico.
7. Se houver unidades impactadas por ações ou riscos/oportunidades, essas unidades são vinculadas ao documento.

## Exceções, bloqueios e erros comuns

- Sem aprovação não existe revisão formal.
- Reabrir o plano não apaga revisões anteriores; ele apenas abre um novo ciclo de edição.
- O documento de evidência não substitui o plano; ele registra a aprovação da revisão.
- Mudanças em rascunho não geram nova evidência até nova aprovação.

## Relação com outros módulos

- Governança gera a revisão e o snapshot.
- Documentação armazena o documento aprovado e o anexo PDF da revisão.
- Storage guarda o arquivo físico gerado.

## Limites atuais

- O Daton AI pode explicar onde a evidência nasce e como ela é relacionada, mas não gera revisões nem documentos automaticamente por conta própria.
- O conteúdo da evidência reflete os dados existentes no momento da aprovação.
- O artigo cobre a geração automática implementada hoje, não fluxos manuais externos de auditoria.
