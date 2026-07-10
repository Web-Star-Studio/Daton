---
hora: "13:26"
autor: João Pedro
branch: fix/planos-acao-modulo-permissao
modulo: Planos de Ação
titulo: Módulo vira permissão configurável (actionPlans) + carga na produção
---

## Planos de Ação — módulo vira permissão configurável (`actionPlans`) + carga na produção

**PR:** #142 (squash em `main`, SHA `27a0cf6`) + **backfill aplicado na produção**. Sem DDL
(reusa a tabela de permissões existente).

**Origem:** a cliente relatou que "Planos de Ação" **não aparecia** na tela de Configurar
Permissões e, ao mesmo tempo, **aparecia para todos** os usuários. Eram o mesmo defeito: o
hub tinha entrado antes sem ser registrado como módulo de permissão.

**O que foi feito:**
- **Planos de Ação virou um módulo configurável.** Passa a aparecer na tela de permissões,
  e a administradora pode conceder ou revogar por usuário.
- **A visibilidade passou a respeitar a permissão:** quem não tem o módulo não vê o hub nem
  a listagem geral. Quem é responsável por um plano específico continua abrindo o seu plano
  normalmente (pela pendência ou pela tela de origem) — nenhum fluxo existente quebrou.
- **Regra por origem:** as ações vinculadas dentro de outras telas (indicadores, SWOT,
  auditorias, ambiental, treinamentos) seguem visíveis para quem tem o módulo daquela tela.

**Carga na produção (não-destrutiva):** para que ninguém perdesse o acesso no momento da
publicação, o módulo foi concedido a todos os **55 colaboradores** não-administradores que
já tinham algum módulo (53 operadores + 2 analistas). Verificado no banco após a carga: 55
concedidos, nenhuma duplicata, e nenhum usuário indevidamente afetado. A partir daí a
administradora controla individualmente quem deve ter o hub.

**Impacto/área:** Configurações (permissões), sidebar, e as rotas de Planos de Ação no
servidor. Corrige exatamente o que a cliente apontou.

**Validações:** `pnpm typecheck` limpo; testes de integração cobrindo o controle de acesso
(hub, listagem, plano individual); revisão automática (cubic, Macroscope) sem apontamento
bloqueante; verificação no navegador com três perfis (admin, operador com e sem o módulo).

**Status:** concluído, mergeado e **em produção com a carga aplicada**.
