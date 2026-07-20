---
hora: "04:20"
autor: João Pedro
branch: feat/gestao-treinamentos-paridade
modulo: Aprendizagem
titulo: Gestão de Treinamentos: paridade com o mockup (cards, exportação, por prazo)
---

## Gestão de Treinamentos — paridade com o mockup da cliente (Aprendizagem)

**O que foi feito:** fechada a paridade da tela *Aprendizagem → Gestão de treinamentos* com o mockup fornecido pela cliente. A tela ganhou: **5 cards operacionais** (Vencidos, A vencer em 30 dias, Pendentes, **Programados** e **Realizados no mês** — os dois últimos inexistentes até então), **linha de filtros por status** espelhando os cards, **busca por colaborador**, **exportação em Excel (.xlsx)** respeitando a aba ativa e os filtros, colunas **Norma** e **Crítico** na visão por colaborador, colunas **Confirmados** e **Realizados** na visão por turma, e a aba **"Por prazo"** reconstruída como painel de três colunas (vencidos / a vencer em 30 dias / pendentes sem turma) com contagens e atalhos de ação.

**Por quê:** a cliente identificou que a tela entregue divergia do mockup — faltavam cards, a exportação e outros elementos operacionais usados pelo RH no acompanhamento de treinamentos.

**Impacto/área:** módulo Aprendizagem, tela de Gestão de treinamentos. No backend, o endpoint de treinamentos ganhou filtros para os novos recortes e o de turmas passou a devolver as contagens de confirmados/realizados. **Sem alteração de schema em produção** — todos os dados já existiam.

**Correções relevantes durante a execução:**
- A especificação assumia que a marcação de "crítico" vinha do catálogo de treinamentos, mas esse campo pertence à obrigatoriedade; a coluna foi corrigida para a origem certa, evitando que ficasse vazia para todos os registros.
- A revisão final identificou que, na aba "Por prazo", os cards e a busca haviam ficado sem efeito, e que a lista de "pendentes sem turma" era montada por amostragem no cliente (podendo exibir coluna vazia com contagem positiva). Ambos corrigidos, o segundo com um filtro exato no servidor.
- Diagnóstico de desempenho com `EXPLAIN ANALYZE` mostrou que a nova contagem de "programados", do jeito que fora escrita, degradaria **todas** as chamadas de um endpoint compartilhado por outras telas do módulo. A contagem foi movida para um caminho eficiente antes da entrega, preservando o desempenho das telas existentes.

**Status:** implementado e revisado; **PR #175 aberto em rascunho**, aguardando aprovação para merge. Nenhuma alteração aplicada em produção nesta entrega.

**Validações:** `pnpm typecheck` sem erros; 40 testes unitários de interface do módulo; 6 testes de integração de backend. Execução em oito etapas com revisão independente a cada etapa e revisão final do conjunto.
