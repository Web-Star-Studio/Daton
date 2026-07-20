---
hora: "00:59"
autor: João Pedro
branch: feat/aprendizagem-ficha-painel
modulo: Aprendizagem
titulo: Ficha do colaborador em painel único (Fase 2)
---

## Ficha do colaborador em painel único (Aprendizagem — Fase 2)

**O que foi feito:** reconstruída a tela de detalhe do colaborador (Aprendizagem → Colaboradores) no formato de **painel único** — as 4 abas (Visão geral / Treinamentos / Competências / Conscientização) deram lugar a uma rolagem contínua, com cabeçalho de indicadores no topo e todos os blocos empilhados. A extração criou componentes de apresentação (cabeçalho com 4 contadores de treinamento, cards de dados pessoais/profissionais, bloco de formação e qualificações) e derivações puras (contadores, tempo de casa, comparação de escolaridade), testáveis isoladamente. O backend passou a resolver o(s) gestor(es) da filial no detalhe do colaborador.

**Por quê:** o layout entregue anteriormente (em abas) divergia do que a cliente havia idealizado (painel único). O pedido foi manter o layout idealizado **sem** alterar o design system da plataforma.

**Fundação:** assenta sobre a Fase 1 (elo treinamento↔competência), exibindo as competências do cargo em três estados — atende, lacuna e "não avaliável" (este nunca conta como lacuna).

**Impacto/área:** módulo Aprendizagem, tela de detalhe do colaborador. Sem alteração de schema em produção (reutiliza a tabela de gestores de filial já existente e a base da Fase 1).

**Status:** MERGEADO na main (squash, PR #171); deploy via autoDeploy do Render.

**Validações:** `pnpm typecheck` limpo; 41/41 testes unitários da ficha (8 arquivos); revisão por subagentes tarefa-a-tarefa + revisão final do branch inteiro (0 achados críticos; 1 importante + 4 menores, todos corrigidos antes do merge).
