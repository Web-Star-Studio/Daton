---
hora: "16:40"
autor: João Pedro
branch: feat/treinamento-nao-aplicavel
modulo: Aprendizagem
titulo: NA fora do KPI de eficácia, hardening do board e contagem coerente na Minha área (PR #182)
---

- **O que:** três correções finais de paridade na regra "Não aplicável" (NA) do módulo de Aprendizagem, aplicando os últimos achados de uma revisão automática do PR #182 (`feat/treinamento-nao-aplicavel`):
  1. O indicador KPI "% Eficácia geral de treinamentos" (`effectiveness_overall`) ainda contava avaliações de eficácia de treinamentos marcados como NA — a cobertura obrigatória já tinha essa exclusão, a eficácia não. Corrigido no serviço de indicadores LMS.
  2. Endurecimento defensivo: as colunas "Em avaliação" e "Concluídas" do board de eficácia passaram a excluir explicitamente treinos NA (hoje já inalcançável pela UI por duas outras vias, mas fecha a lacuna caso algum caller futuro pule esses filtros).
  3. Na tela "Minha área" do colaborador, o número no título "Meus treinamentos (N)" podia divergir da quantidade de linhas realmente listadas quando havia ao menos um treino NA (o número usava a contagem de obrigação, que exclui NA; a lista mostra todos os registros, incluindo NA). Corrigido para o título refletir o total realmente exibido.
- **Por quê:** a regra central do módulo é que um treinamento marcado "Não aplicável" fica invisível para toda contagem de obrigação (não é pendência, não vence, não é realizado, não entra em numerador nem denominador) — mas nunca deve criar inconsistência visual (número que não bate com a lista) nem contaminar indicadores de eficácia.
- **Impacto/área:** Aprendizagem/LMS — indicador de eficácia (KPI corporativo), board de avaliação de eficácia, tela "Minha área" do colaborador. Sem alteração de schema/DDL.
- **Status:** concluído; commit `3e423a5c` na branch `feat/treinamento-nao-aplicavel`, push feito, PR #182 atualizado (aberto, não mergeado).
- **Validação:** `pnpm typecheck` limpo (libs, api-server, web, mockup-sandbox, scripts, e2e). Testes de integração (`TEST_ENV=integration`, banco local): `treinamento-nao-aplicavel` (15/15), as 4 suítes `effectiveness-*` de rotas (34/34), `effectiveness-methods` (5/5), `lms-metrics` (11/11, incluindo teste novo para o item 1), `kpi-lms-indicators` (6/6), `gestao-trainings-stats` (6/6). Testes unitários web da pasta `aprendizagem` (16 arquivos, 62/62). Nenhuma regressão.
