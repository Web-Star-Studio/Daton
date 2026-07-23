---
hora: "16:00"
autor: João Pedro
branch: worktree-turma-multi-filial
modulo: Aprendizagem
titulo: Experiência do responsável por filial da turma (pendências, aba, notificação)
---

**O que foi feito:** implementada a experiência completa do **responsável por filial** de uma turma — antes o responsável era apenas gravado, sem aparecer em lugar nenhum. Agora, para cada uma das quatro frentes:

1. **Visível na turma:** o painel de detalhe da turma passa a mostrar, por filial, quem é o responsável.
2. **Nas Pendências do responsável:** quando alguém é definido responsável por uma filial numa turma agendada/em andamento, essa turma aparece automaticamente em "Suas Pendências" da pessoa (com prazo = data de início), reaproveitando o painel de pendências já existente. Cada responsável enxerga só a sua filial.
3. **Aba "Minhas como responsável":** um filtro na tela de Turmas para a pessoa (ou o gestor) ver só as turmas em que é responsável.
4. **Notificação + e-mail:** ao ser vinculado como responsável, a pessoa recebe aviso no sistema e por e-mail. Re-salvar a turma sem trocar o responsável não gera aviso repetido, e quem se atribuiu a si mesmo não é notificado.

**Por quê:** o cliente pediu para "ver como funciona do lado do responsável vinculado". A checagem mostrou que a informação existia no banco mas não tinha nenhuma tela nem aviso — ou seja, o responsável não sabia que era responsável. Estas quatro entregas fecham essa lacuna.

**Impacto / área afetada:** módulo Aprendizagem (turmas e pendências) e notificações. Não exigiu mudança de banco — reaproveita a tabela de vínculo turma↔filial e a tabela de notificações já existentes.

**Status:** entregue no mesmo PR draft (#204), somando-se à primeira parte (turma com múltiplas filiais). Validado em ambiente local dirigindo a interface: login como responsável mostrando a pendência e a notificação, e login como administrador mostrando o responsável de volta na turma.

**Validações:** `pnpm typecheck` limpo; 5 testes automatizados novos cobrindo pendência do responsável, turma já realizada não gerando pendência, o filtro por responsável, a notificação indo só para o novo responsável (e não para quem criou) e a ausência de aviso repetido ao re-salvar; além das suítes de pendências e turmas já existentes (36 testes no lote final) e os testes de interface do front.
