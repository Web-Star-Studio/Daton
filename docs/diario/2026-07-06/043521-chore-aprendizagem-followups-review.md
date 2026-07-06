---
hora: "04:35"
autor: João Pedro
branch: chore/aprendizagem-followups-review
modulo: Aprendizagem
titulo: Follow-ups do review (#115) — unificação SQL×JS da eficácia; #113/#114/#116 diferidos
---

## Follow-ups do review do módulo de Aprendizagem — #115 fechado; #113/#114/#116 diferidos com justificativa

**O que foi feito**

- **Fechado o follow-up #115 (tech-debt)** — unificação da regra de `effectivenessStatus` entre SQL e JS no board de Avaliação de Eficácia:
  - Fragmento SQL único para o critério "presente" (não-nulo **e não-vazio**), espelhando o comportamento do código JS (string vazia conta como ausente) — usado no escopo `needs_evaluation`, no filtro de pendentes e na contagem de pendentes.
  - Escopo `needs_evaluation` passou a incluir treinos "em avaliação por prazo" (antes sumiam da lista padrão) — corrige divergência SQL×JS apontada na revisão automática.
- **Merge do PR #117** na branch principal → deploy automático.

**Findings da revisão automática (tratados antes do merge)**

- Divergência do escopo `needs_evaluation` (não considerava treino só-com-prazo) — corrigida, com teste dedicado.
- Documentação de spec (SP5) atualizada para o estado `in_review`.

**Diferidos deliberadamente (documentados nos respectivos issues)**

- **#113** (constraints de banco por tenant / defesa em profundidade): o próprio issue recomenda "fazer deliberadamente depois"; exige redesenho/migração — não seguro para janela automática noturna.
- **#114** (paginação por cursor no board + índices): mudança grande de experiência + alteração de banco em produção; prioridade média (o padrão da tela já a mantém enxuta).
- **#116** (itens menores restantes — edge de indicador, refatorações de organização/segurança de código): risco desproporcional para deploy automático sem acompanhamento; melhor com revisão.

**Impacto / área**

Board de Avaliação de Eficácia mais consistente (regra única entre banco e aplicação). **Sem efeito sobre os dados reais** — apenas elimina casos-limite teóricos.

**Status:** #115 concluído e no ar; #113/#114/#116 permanecem abertos e documentados para uma sessão dedicada.

**Validações:** `pnpm typecheck` verde (todos os pacotes); **42 testes de integração** verdes (incluindo os casos-limite novos); CI verde; revisão automática (cubic/coderabbit) aprovada após as correções.
