---
hora: "15:51"
autor: João Pedro
branch: fix/escolaridade-cargo-vocabulario
modulo: Aprendizagem
titulo: Fix: escolaridade mínima do cargo não era comparada na ficha do colaborador
---

## Correção: escolaridade mínima do cargo não era comparada na ficha do colaborador

**O que foi feito:** corrigido o comparador de escolaridade da ficha do colaborador ("Formação e qualificações"), que deixava de acusar o descumprimento do requisito de escolaridade mínima do cargo em 3 de 5 opções possíveis de cadastro do cargo.

**Por quê:** a cliente reportou o problema em teste real — cadastrou o cargo "Auxiliar de Pessoal" com escolaridade mínima "Ensino Médio Completo", associou um colaborador com "Fundamental Incompleto" e nada na tela indicou a divergência.

**Causa raiz:** o cargo e o colaborador usam vocabulários (listas de opções) diferentes para escolaridade — ex.: cargo tem "Ensino Médio Completo" e "Técnico", colaborador tem "Médio Completo" e "Superior Incompleto". O motor de comparação (`compareEducation`, em `artifacts/web/src/pages/app/aprendizagem/colaboradores/_lib/ficha-derivations.ts`) só reconhecia o vocabulário do colaborador. Quando o requisito do cargo usava uma grafia que o motor não conhecia, ele tratava como "sem requisito definido" — silenciando o gap real em vez de exibi-lo. Isso afetava 3 das 5 opções do formulário de cargo ("Ensino Fundamental", "Ensino Médio Completo", "Técnico"); só "Superior Completo" e "Pós-graduação" funcionavam, por coincidência de grafia com o vocabulário do colaborador.

**Impacto/área afetada:** módulo Aprendizagem → ficha do colaborador (painel "Formação e qualificações"). Não exigiu alteração de banco de dados — o campo de escolaridade já era texto livre nas duas entidades (cargo e colaborador); o problema era só na lógica de comparação no frontend.

**Status:** concluído. PR #198 aberto em modo draft (`fix/escolaridade-cargo-vocabulario`), aguardando revisão/merge.

**Validações:**
- `pnpm run typecheck:libs && pnpm --filter @workspace/web typecheck` — sem erros.
- Testes unitários (`vitest`, projeto `web-unit`, diretório `artifacts/web/tests/pages/aprendizagem/`): 20 arquivos, 111 testes, todos passando — inclui 6 casos novos reproduzindo exatamente o cenário relatado pela cliente, e o teste do componente da tela (`formacao-qualificacoes.unit.test.tsx`) sem regressão.
