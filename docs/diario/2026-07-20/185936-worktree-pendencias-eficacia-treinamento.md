---
hora: "18:59"
autor: João Pedro
branch: worktree-pendencias-eficacia-treinamento
modulo: Aprendizagem
titulo: Pendências de eficácia no painel pessoal — entregue em produção
---

**O que foi feito.** As pendências de avaliação de eficácia passaram a aparecer no painel "Suas Pendências", a página inicial de cada usuário. Entregue em produção (PR #181, mergeado em 20/07/2026). Sem alteração de banco de dados.

**Por quê.** Ao testar o módulo com um usuário que tinha pendências de eficácia, elas não apareciam no painel pessoal. A investigação mostrou dois motivos. O primeiro: o painel só conhecia quatro origens de pendência (indicadores, planos de ação, não conformidades e documentos regulatórios) — treinamento não era uma delas, então nada do módulo de Aprendizagem podia chegar ali. O segundo, mais de fundo: a atribuição da avaliação registrava apenas um **papel** ("gestor", "RH", "instrutor" ou "colaborador"), nunca uma pessoa. Sem uma pessoa responsável, o conceito de "minha pendência" simplesmente não existia nesse módulo — é também por isso que o quadro de eficácia exibe a organização inteira para todos.

**Como foi resolvido.** O papel atribuído passou a ser convertido em pessoas no momento da consulta, sem mexer na estrutura do banco: "colaborador" chega ao usuário do próprio colaborador; "gestor", aos gestores da filial; "RH" e "instrutor", aos administradores. Quando ninguém é encontrado — filial sem gestor cadastrado, colaborador sem usuário —, o item passa aos administradores em vez de desaparecer, para que nenhuma cobrança fique sem responsável. Treinamentos ainda sem avaliador definido aparecem como um único item consolidado para os administradores, e não um por treinamento, porque essa fila é alimentada por toda conclusão de treinamento e a listagem individual tornaria o painel inutilizável.

**Correções incorporadas durante a revisão.** A revisão automática e a verificação em tela apontaram quatro defeitos que os testes não pegaram, todos corrigidos antes da entrega:
1. O painel cobrava avaliação de eficácia de treinamento que ainda **não havia acontecido** — o número exibido ao administrador ficava inflado e divergia da própria tela que o item abria.
2. O card aparecia para usuários que **não têm permissão** de registrar a avaliação (perfil somente-leitura e usuários sem acesso ao módulo), gerando uma cobrança que a pessoa não conseguia encerrar.
3. Um risco de integração: a movimentação de regras compartilhadas para um arquivo novo quase desfez, sem aviso, uma correção entregue em paralelo (o status "Não aplicável").
4. Registros duplicados na lista de avaliações concluídas no dia quando dois avaliadores encerram o mesmo treinamento.

**Impacto/área afetada.** Painel "Suas Pendências" (nova origem e novo indicador) e módulo de Aprendizagem. As regras do quadro de eficácia passaram a ter fonte única, compartilhada entre a tela e o painel, eliminando a possibilidade de os dois exibirem números diferentes.

**Status e validações.** Concluído e em produção. Validações: verificação conduzida no navegador com cinco perfis distintos (administrador, gestor de filial, colaborador vinculado, perfil somente-leitura e usuário sem acesso ao módulo), com o comportamento observado igual ao esperado em todos, e o número do painel conferindo com o da tela do quadro; verificação automática de tipos sem erros; 54 testes automatizados da área aprovados e 330 da suíte completa do servidor. Três falhas remanescentes na suíte foram confirmadas como anteriores a este trabalho, reproduzindo-se em cópia limpa da base principal. Ambiente de teste local e descartável — produção não foi acessada durante a verificação.
