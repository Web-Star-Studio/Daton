---
hora: "18:04"
autor: João Pedro
branch: chore/diario-tooling
modulo: SWOT
titulo: SWOT v2 finalizado e mergeado (#82): pilar em gráfico de barras + Objetivos por módulo
---

- **O que:** Finalização e **merge do módulo SWOT** (PR #82). O objetivo de cada fator passou a vir de **fonte plugável** (Indicadores/KPI ou SWOT). A visão do pilar foi **redesenhada para um gráfico de barras de prioridade**: fatores ordenados por gravidade, comprimento da barra = resultado (Performance × Relevância), **linha do corte 8** (resultado ≥ 8 requer ação), botão "Criar ação" embutido em cada fator e uma aba "Por área" (perspectiva × faixa). A antiga matriz 4×4 de contagem foi substituída por essa leitura mais intuitiva. A visão geral e o pilar agora têm **rolagem** para ver todos os fatores. A aba **"Objetivos" virou uma visão agregada por módulo de origem** (somente leitura, com expansão objetivo → fatores associados): definiu-se que o **SWOT é consumidor puro de objetivos** (eles nascem em módulos geradores, como o Indicadores), eliminando objetivos "sem origem".
- **Por quê:** Pedido da cliente — leitura mais intuitiva, em gráfico de barras, sem precisar rolar para achar a prioridade — e coerência do modelo (objetivos do sistema agregados por módulo, com fonte única e mensuráveis).
- **Impacto/área:** Módulo SWOT (Organização) e integração com Plano de Ação. Mudanças no front (página do SWOT e componente do pilar) e na aba de Objetivos. **Sem mudança destrutiva de banco** (a tabela de objetivos próprios do SWOT foi mantida dormente; vínculos antigos continuam válidos).
- **Status:** concluído e **mergeado na main (#82, squash)**.
- **Validação:** `pnpm typecheck` completo (bibliotecas + API + web + scripts + e2e) verde; **3 rodadas de revisão técnica automatizada** (multi-agente) — nenhum problema grave; ajustes de acessibilidade, modo escuro, responsividade e textos aplicados.
