---
hora: "15:20"
autor: João Pedro
branch: fix/score-precisao-nota
modulo: Planos de Ação
titulo: Checklist de tarefas no campo "Como" das ações
---

## O que foi feito
Cada ação (5W2H) de um Plano de Ação passou a ter, sob o campo **Como**, uma **checklist de tarefas** (passos). O responsável inclui os passos e vai marcando conforme executa. O método em texto continua; a checklist fica logo abaixo, com contador "X/Y concluídas" e um indicador de progresso no cabeçalho recolhido da ação (mostra o andamento sem precisar expandir). Pressionar **Enter** encadeia o próximo passo; marcar respeita o modo somente-leitura (plano encerrado / perfil de leitura).

## Por quê
Atende ao pedido de permitir quebrar o "Como" (método) em tarefas acompanháveis, dando visibilidade do progresso de execução de cada ação.

## Impacto / área
Módulo **Planos de Ação** — editor das ações do plano. Mudança isolada: não afeta o restante do plano, a criação de planos, a sugestão por IA, os agregados/pendências nem exportações.

## Como
- Nova coluna anulável `how_tasks` (jsonb) na tabela das ações do plano; DDL aditiva e idempotente (`ADD COLUMN IF NOT EXISTS`) versionada em `scripts/sql/`.
- Campo adicionado ao contrato da API (OpenAPI) com regeneração de zod e cliente; rota e serializer passam a gravar/expor o campo, com limpeza no servidor (apara texto, descarta passo vazio, teto de tamanho).
- Marcar um passo não gera entrada no histórico (é execução, não replanejamento).

## Status
Entregue no PR #194 (em rascunho/draft). Pendente: aplicar a DDL aditiva em produção e revisão/merge.

## Validações
- `pnpm typecheck` OK (monorepo inteiro).
- Testes unitários (comportamento do card: adicionar/marcar/vazio não persiste; normalização no servidor; coluna no schema) e um round-trip de integração — todos passando.
- Observação: 2 testes que falham na suíte (`operational-planning`, `organization-sections`) já falhavam na `main` antes desta mudança (pré-existentes, não relacionados).
