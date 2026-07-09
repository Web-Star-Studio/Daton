---
hora: "22:12"
autor: João Pedro
branch: chore/diario-tooling
modulo: Aprendizagem (LMS)
titulo: Módulo fiel ao mockup: Fases 2–6 (telas alinhadas + Cargos/Indicadores/Hub/Mudança de cargo) + indicador de certificado
---

## Módulo Gestão de Aprendizagem (LMS) — alinhamento ao mockup da cliente e telas novas

Execução do plano de 6 fases para deixar o módulo de Aprendizagem fiel ao mockup idealizado pela cliente (layout do mockup, paleta do design system Daton). Todas as entregas abaixo foram mergeadas na `main` e estão em produção.

### Fase 2 — Alinhamento das telas existentes (PRs #129–#134)
Ajuste das 6 telas já existentes ao layout do mockup:
- **Dashboard** (#129): subtítulo consolidado + faixa de alerta de filiais em estado crítico (dado real de `byUnit.status`).
- **Programa anual** (#130): subtítulo PAT/ISO e subtítulos contextuais nas métricas (só "% do programa" é derivado; demais são rótulos honestos, sem inventar mês).
- **Cronograma/Obrigatoriedades** (#131): filtros por cargo, escopo e prazo na matriz.
- **Catálogo** (#132): métrica de treinamentos ativos em destaque e ficha em 2 colunas.
- **Colaboradores** (#133): ordem de colunas do mockup + coluna "Gestor direto" (placeholder), mantendo cards de métrica, seleção em massa, paginação e página de detalhe.
- **Turmas** (#134): preview do treinamento no passo 1 e badge de status sempre visível no painel.
- **Avaliação de eficácia**: avaliada e **mantida como estava** — já mais granular que o mockup (a coluna "Em avaliação" já exibia urgência/avaliador).

### Fase 3 — Nova tela "Cargos e competências" (#137)
Master-detail: lista de cargos → matriz de competências requeridas do cargo (nível + marcador de criticidade) → banco de competências (reuso de componente existente). Sem backend novo.

### Fase 4 — Nova tela "Indicadores LMS" (#138)
Escopo híbrido: reusa os dados do dashboard (cards com tag ISO, eficácia por norma, desempenho por filial) e lista os indicadores KPI formais (fonte `lms`) com link direto ao módulo de Indicadores. Permissão de ativação alinhada ao guard real do backend (módulo KPI + escrita), corrigida também no dashboard.

### Fase 5 — Novo hub "Gestão de treinamentos" (#139)
Landing operacional: 4 cards de status clicáveis (vencidos / a vencer em 30 dias / pendentes / concluídos), filtros (filial/cargo/norma) e 3 abas (por colaborador, por turma, por prazo). Paginação com limite seguro e "carregar mais"; filtro de norma derivado do catálogo. Passou por 4 rodadas de revisão automatizada.

### Fase 6 — "Mudança de cargo" — histórico e recálculo (#140)
Constatação: o **recálculo de obrigatoriedades ao trocar de cargo já existia** (revincula os treinamentos do novo cargo, aproveita os já concluídos e nunca remove histórico). Esta fase acrescentou o que faltava — o **histórico**: nova tabela `employee_position_changes` (DDL aditiva aplicada em produção), registro do evento no update do colaborador (best-effort, para a auditoria não derrubar a operação), endpoint de listagem e a seção "Mudança de cargo — recálculo automático" no Cronograma.

### Correção adicional — Indicador de certificado (#135)
Dúvida da cliente ("onde vejo os certificados que anexei para comprovar os requisitos?"): a caixa "Conformidade do Cargo" não indicava os anexos. Adicionado um indicador (clipe + contagem) nos requisitos com certificado, que rola até o cartão da competência e o destaca.

### Impacto / área afetada
Frontend `@workspace/web` (módulo Aprendizagem), backend `@workspace/api-server` (rotas de employees/kpi), schema `@workspace/db` (nova tabela) e contratos OpenAPI + código gerado (Zod/React Query).

### Status e validações
- Todas as PRs mergeadas na `main` e em produção; `pnpm typecheck` completo verde em cada uma; findings de revisão (typecheck, cubic, Macroscope, codex/coderabbit) tratados antes do merge.
- DDL da Fase 6 aplicada e verificada em produção (tabela com 9 colunas + 3 índices).
- Princípio mantido: nenhum dado inventado — itens sem suporte de backend foram registrados como deferidos em cada PR.

### Pendências
- **Gestor direto (backend)**: a coluna visual foi entregue; a fiação (campo `managerId`, DDL, seletor no cadastro) segue **deferida**, aguardando a cliente definir o fluxo de gestor.
