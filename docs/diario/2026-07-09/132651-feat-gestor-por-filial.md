---
hora: "13:26"
autor: João Pedro
branch: feat/gestor-por-filial
modulo: Organização
titulo: Gestor por filial (vínculo N:N usuário↔unidade)
---

## Organização — Gestor por filial (vínculo N:N usuário↔unidade)

**PR:** #141 (squash em `main`, SHA `0627d6d`) — inclui DDL nova (tabela `unit_managers`).

**O que foi feito:** fundação do conceito de **gestor por filial**. Um usuário pode ser
designado gestor de uma ou mais unidades (relação N:N via a tabela nova
`unit_managers`). A tela de **Unidades** ganhou uma coluna **Gestor** direta e uma aba
**Gestores** para atribuir/remover. É um papel distinto do avaliador de eficácia — um
não implica o outro.

**Por quê:** a cliente pediu que cada filial tenha um responsável de gestão identificável,
e essa é a base para o **Perfil Gerente** (a visibilidade restrita à filial do gestor),
que virá como trabalho dedicado por envolver controle de acesso.

**Impacto/área:** módulo Organização (Unidades). Aditivo — nenhuma tela existente muda de
comportamento; a coluna e a aba só aparecem para quem administra unidades.

**Status:** concluído e mergeado; DDL aplicada. A **visibilidade** do gestor (logar e ver
só a sua filial) permanece como próximo passo, a ser desenhado antes de codar.
