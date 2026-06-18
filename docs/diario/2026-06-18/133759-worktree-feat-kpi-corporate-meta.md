---
hora: "13:37"
autor: João Pedro
branch: worktree-feat+kpi-corporate-meta
modulo: Indicadores (KPI)
titulo: Meta/tolerância calculada do corporativo + limpeza de corporativos de teste
---

## Indicadores (KPI) — Meta/tolerância calculada do corporativo + limpeza de corporativos de teste

**O que foi feito**

1. **Limpeza em produção (Transportes Gabardo):** removido o indicador corporativo
   "Consumo de energia elétrica - Corporativo", que havia sido criado pela equipe
   como teste de agregação (rollup das 7 filiais). A exclusão foi cirúrgica e
   transacional: removeu apenas o indicador-pai e seus vínculos de rollup,
   preservando integralmente os 7 indicadores das filiais e seus 102 lançamentos
   mensais. Confirmado por verificação de dados que era o único indicador nesse
   padrão (agregação automática) na conta da cliente.

2. **Nova funcionalidade — meta/tolerância do corporativo calculada das filiais
   (PR #97, mergeado):** a meta de um indicador corporativo passa a ser
   **calculada automaticamente** a partir das metas das filiais, pela mesma
   estratégia da agregação (soma/média/mínimo/máximo) — atendendo pedido da
   cliente. O valor é recalculado ao vivo (acompanha mudanças nas filiais),
   incluindo carry-forward (em ano ainda não aberto usa a meta herdada dos
   filhos). O usuário não digita mais a meta do corporativo: vê apenas uma prévia
   calculada na criação, e os campos de edição manual de tolerância ficam ocultos
   para corporativos. As telas de exibição (tabelas, cards) passaram a mostrar a
   meta calculada sem alteração de layout.

**Por quê / impacto**

A cliente solicitou que a tolerância do corporativo "seguisse a mesma linha" da
agregação dos valores. Antes, a meta era digitada manualmente e podia divergir da
realidade das filiais; agora é sempre coerente e sem manutenção. Área afetada:
módulo de Indicadores (backend de rollup, contrato de API e telas de Indicadores
e Lançamentos).

**Status e validações**

Concluído e integrado ao `main` (PR #97, squash). Implementado com TDD:
testes unitários da agregação e testes de integração do endpoint (soma, bloqueio
de edição manual, carry-forward) — todos verdes. `pnpm typecheck` e `pnpm build`
limpos; CI do PR verde (typecheck, CodeQL, revisor automático). Conflito com o
recém-mergeado recurso de Perfil Gerente (#98) resolvido e revalidado (testes de
ambas as features passando juntos). Testado manualmente em ambiente real (conta
Demo) pela equipe.
