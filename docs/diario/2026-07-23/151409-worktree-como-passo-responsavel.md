---
hora: "15:14"
autor: João Pedro
branch: worktree-como-passo-responsavel
modulo: Gestão de Ações
titulo: Responsável por linha do "Como" + co-responsáveis derivados
---

## Gestão de Ações — responsável por linha do "Como" e co-responsáveis derivados

**O que foi feito.** Cada linha do campo "Como" de uma ação (a checklist 5W2H) passou a ter um responsável próprio: o responsável da ação distribui os passos (para outras pessoas ou para si). Com isso, o campo "Co-responsáveis" do plano deixou de ser preenchido à mão e passou a ser **derivado automaticamente** — é a soma de quem responde por alguma ação com quem recebeu algum passo, tirando o ponto focal.

**Por quê.** O campo de co-responsáveis não vinha sendo usado e não estava claro o que fazia. A regra combinada foi: quem entra no "Como" já é co-responsável, por definição.

**Impacto/área.** Módulo Gestão de Ações (planos de ação). Sem alteração de banco (o dado do responsável do passo vive dentro de um campo já existente). Como o co-responsável agora é calculado das ações, os avisos de cobrança, o escalonamento de prazo, a lista, o filtro "Atribuídas a mim" e a regra de independência da avaliação de eficácia passaram a funcionar sozinhos.

**Acesso.** Quem recebe um passo (ou responde por uma ação) alcança a ficha e mexe apenas na sua parte — marca o próprio passo, sem poder editar o plano inteiro nem o trabalho dos outros. A condução do plano segue com o ponto focal, o avaliador e quem tem o módulo. Efeito colateral assumido e acordado: co-responsáveis marcados à mão hoje deixam de poder editar o plano todo (passam a acesso restrito).

**Status/validações.** Entregue em PR draft (#205). `pnpm typecheck` OK; testes unitários, de tela e 60 testes de integração dos planos de ação (incluindo 6 novos do fluxo dono-de-passo) verdes. Pendência registrada: cobrança com prazo por passo exigiria mudança de estrutura de dados — deixada como próximo passo.
