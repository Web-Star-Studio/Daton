---
hora: "03:25"
autor: João Pedro
branch: worktree-feat-tratativas-plano-acao
modulo: Gestão de Ações
titulo: Tratativas configuráveis (8 métodos de análise) e múltiplas ações por plano
---

## Contexto

A cliente considerou que oferecer **apenas a Causa Raiz (5 Porquês)** como método de análise no
Plano de Ação era pouco, e pediu métodos adicionais. Além disso, apontou que **um plano de ação
pode conter várias ações** — e o sistema só permitia registrar uma (o bloco 5W2H era único).

## O que foi feito

**1. Tratativas configuráveis por empresa (8 métodos de análise de causa)**
Cada Plano de Ação passa a poder usar um ou mais métodos estruturados de análise: 5 Porquês,
Ishikawa (6M), A3, FMEA (com RPN calculado automaticamente), Árvore de Falhas, Kepner-Tregoe,
RCA Apollo e Análise de Barreiras. Cada método tem um editor próprio, guiado (nada de "campo de
texto solto" onde existe vocabulário fixo — categorias, escalas e status são listas fechadas).
Um **catálogo por empresa** (gerido em Configurações → Sistema → Tratativas, só administrador)
controla quais métodos ficam ativos, quais vêm pré-selecionados como padrão e a ordem — assim
cada empresa vê só o que usa. Na criação do plano, as tratativas padrão já vêm marcadas.

**2. Múltiplas ações por plano**
O antigo 5W2H único deu lugar a uma **tabela de ações rastreáveis**: cada ação tem "O quê",
responsável (usuário do sistema), prazo (data), status e os demais campos do 5W2H. O plano mostra
o progresso ("X de N concluídas"), destaca ações atrasadas, e **cada ação vira uma pendência
própria** do seu responsável (em "Suas Pendências"), com notificação de atribuição — sem tirar a
visão do plano de quem o conduz.

**3. Histórico e migração**
O versionamento do planejamento ("Ver versões"/restaurar) passou a cobrir as tratativas. Foi
escrito um script de migração idempotente que semeia o catálogo em todas as empresas e converte o
conteúdo legado (os 5 porquês e o 5W2H antigos) para o novo modelo **sem descartar nada** — o que
não puder ser resolvido automaticamente é preservado no campo de observações da ação.

## Impacto / área afetada

Módulo **Gestão de Ações** (Planos de Ação), transversal aos módulos que criam planos
(Não Conformidades, Indicadores, SWOT, Riscos). Banco de dados: nova tabela de catálogo, nova
tabela de ações e nova coluna de tratativas no plano.

## Status e validações

- **Implementação concluída e validada** no ambiente de desenvolvimento: `pnpm typecheck` do
  monorepo limpo; testes unitários (node) 25/25 arquivos; testes da feature (web e integração)
  todos verdes; **teste ponta a ponta (E2E, navegador real) passando** no fluxo completo; `pnpm
  build` com sucesso.
- **Pendente — antes do merge:** o branch precisa ser reconciliado com a `main` (que avançou em
  outras entregas desde o corte, incluindo a migração do método de eficácia). É uma reconciliação
  aditiva, mas obrigatória.
- **Pendente — pós-merge (manual, com o time):** aplicação do DDL e do backfill no banco de
  produção. **Ainda não aplicados** — é um passo manual deliberado.
- **Em aberto para decisão do time (não bloqueia):** com cada ação tendo seu próprio responsável,
  vale avaliar se a regra de independência da eficácia (avaliador ≠ responsável) deve passar a
  considerar também os responsáveis das ações, não só o do plano.

Entregue como Pull Request em rascunho (draft), aguardando revisão e a reconciliação com a `main`.
