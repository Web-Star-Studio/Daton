---
hora: "16:03"
autor: João Pedro
branch: feat/swot-clique-fator-editar
modulo: SWOT
titulo: Clicar no fator abre o diálogo de edição (Todos os fatores + card 'requer ações')
---

Na tela **SWOT** (Organização), o fator passou a abrir o diálogo de edição ao ser clicado, além do já existente ícone de lápis:

- **Aba "Todos os fatores"**: clicar na **descrição** do fator abre a edição.
- **Painel "Fatores que requerem ações imediatas"**: o **card inteiro** ficou clicável e abre a edição.

**Motivo:** melhorar a usabilidade/descoberta — antes a edição só era acessível pelo ícone de lápis; o alvo de clique agora é maior e mais evidente, atendendo a pedido do usuário.

**Comportamento e cuidados:**
- Restrito a perfis com **permissão de escrita**; para somente-leitura permanece texto simples.
- **Acessível por teclado** (Enter/Espaço no card em foco, com guarda para não disparar a edição quando o Enter parte de um botão interno).
- O botão **"Criar ação"** e o **widget de ações vinculadas** mantêm o comportamento próprio (não abrem a edição).

**Área/impacto:** frontend web, arquivo `artifacts/web/src/pages/app/organizacao/swot.tsx` (+43/-9). Sem mudanças de API, schema ou código gerado. Reaproveita o handler de edição já existente.

**Status:** concluído e **mergeado na `main`** — PR #128 (squash, commit `b4d0d3b`).

**Validações:** check obrigatório **`pnpm typecheck` verde** no CI do PR, além de Analyze (js/ts e python), CodeRabbit, Macroscope (Correctness) e cubic — todos com sucesso. O merge exigiu estado `CLEAN` no GitHub.
