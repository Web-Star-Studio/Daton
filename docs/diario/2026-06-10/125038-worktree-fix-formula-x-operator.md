---
hora: "12:50"
autor: Aimlock
branch: worktree-fix-formula-x-operator
modulo: Indicadores (KPI)
titulo: Correção: letra "x" em nomes de termos travava o salvamento de fórmulas
---

**O que foi feito:** Correção de bug no construtor de fórmulas do módulo de Indicadores (KPI) e reparo do indicador afetado da cliente.

**Problema:** Cliente (Ana, Transportes Gabardo) não conseguia salvar o indicador "Custos Fixos" — a tela travava. O interpretador de fórmulas tratava qualquer letra "x" como sinal de multiplicação, quebrando o nome em "Custos Fi" × "os".

**Correção no código:** O "x"/"X" agora só é interpretado como multiplicação quando aparece isolado entre espaços ou operadores (ex.: "a x 100"). Dentro de palavras ("Fixos", "máxima", "taxa") permanece como letra. Mergeado na main via PR #89 (commit 94a724b); deploy automático do frontend via Cloudflare Pages.

**Correção dos dados em produção:** Indicador id 59 ("Custos Fixos", org Transportes Gabardo) atualizado em transação no banco: fórmula "custos_fi" → "custos_fixos" (termo único, input de um valor, como a cliente queria); 4 lançamentos de 2026 (jan–abr) migrados para a nova chave com valores preservados; 8 lançamentos de 2025 intactos. Estado final verificado por consulta.

**Validações:** 52 testes unitários passando (incluindo 2 novos de regressão), check obrigatório "pnpm typecheck" verde no CI do PR.

**Status:** Concluído. Pendência: nenhuma — a cliente já pode editar/usar o indicador normalmente.
