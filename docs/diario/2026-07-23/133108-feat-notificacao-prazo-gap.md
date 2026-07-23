---
hora: "13:31"
autor: João Pedro
branch: feat/notificacao-prazo-gap
modulo: Aprendizagem
titulo: PR #202 mergeado — escalonamento de prazo de gap vencido (com correções da revisão)
---

## PR #202 mergeado — escalonamento de prazo de gap vencido

**O que foi feito:** revisão e merge do PR #202 (Fase 2 do acompanhamento de gap — aviso ao administrador). Antes do merge, a revisão automática (IA) apontou dois problemas reais que foram corrigidos na própria PR:

1. O cálculo de "hoje" usava o fuso horário do processo do servidor em vez do fuso configurado para o agendador (America/Sao_Paulo). Como o processo roda em UTC em produção, isso podia fazer a rotina que dispara logo após uma implantação (fora do horário fixo do dia a dia) tratar um prazo que ainda não tinha vencido no horário de Brasília como já vencido. Corrigido para calcular a data sempre no fuso correto.
2. A verificação que evita notificação duplicada não era resistente a duas execuções simultâneas da rotina. Reforçada com um mecanismo de trava já usado em outro ponto do sistema para o mesmo tipo de proteção.

Também corrigidos dois testes automatizados que pararam de funcionar por causa de uma mudança não relacionada (PR #200, que tornou obrigatório o texto de evidência ao anexar prova de competência) — os testes não estavam checando esse retorno e continuavam "passando" mesmo testando o cenário errado.

**Por quê:** fechar definitivamente o pedido original da cliente com qualidade — a prática do projeto é ler os achados da revisão automática antes de mergear, não só confiar no status verde.

**Impacto/área afetada:** módulo Aprendizagem. **Sem alteração de banco de dados** — diferente da Fase 1, esta entrega não precisa de nenhuma migração em produção; reaproveita a tabela de notificações já existente.

**Status:** concluído e mergeado em `main`. As três entregas do pedido da cliente (gap visível, prazo de regularização, aviso ao admin) estão todas em produção ou prontas para o próximo deploy automático.

**Validações:**
- `pnpm typecheck` (raiz — libs + web + api-server + e2e) sem erros.
- 37 testes de integração passando (gap-deadline, escalonamento, evidência de competência, resolvedor de competência, colaboradores) após as correções.
- Envio real de e-mail testado e confirmado recebido pelo usuário antes do merge.
- Revisão automática (IA) confirmou "todos os problemas reportados foram corrigidos" na versão final.
