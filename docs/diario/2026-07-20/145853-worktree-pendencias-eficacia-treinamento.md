---
hora: "14:58"
autor: João Pedro
branch: worktree-pendencias-eficacia-treinamento
modulo: Aprendizagem
titulo: Pendências de avaliação de eficácia no painel Suas Pendências
---

**O que foi feito.** As pendências de avaliação de eficácia do módulo de Aprendizagem passaram a aparecer no painel "Suas Pendências" (página principal do usuário). Aberto o PR #181 em draft.

**Por quê.** Ao testar o módulo com um usuário que tinha pendências de eficácia, elas não apareciam no painel pessoal. A investigação mostrou que não era um filtro errado: o motor de pendências é fechado — uma união de origens (`PendenciaSource`) e um registro com quatro provedores (indicadores, planos de ação, não conformidades, documentos regulatórios). Nenhum de treinamento, então nada do módulo de Aprendizagem podia chegar ao painel.

Havia um segundo impedimento, de modelagem: o painel exige um usuário responsável por item, mas a atribuição de eficácia grava apenas um **papel em texto** (gestor, RH, instrutor ou colaborador) e um prazo. O usuário avaliador só é gravado depois da avaliação, como registro histórico. Ou seja, "minha pendência" não existia como dado nesse módulo — motivo pelo qual o quadro de eficácia também exibe a organização inteira para qualquer usuário com acesso.

**Como foi resolvido.** Sem qualquer alteração de banco. O papel atribuído passa a ser resolvido em pessoas no momento da leitura: colaborador resolve para o usuário vinculado ao colaborador; gestor, para os gestores da filial; RH e instrutor, para os administradores da organização (o instrutor é texto livre, não um usuário do sistema). Quando a resolução específica não encontra ninguém — filial sem gestor cadastrado, colaborador sem usuário —, o item passa aos administradores em vez de desaparecer, para que nenhuma pendência fique sem responsável.

Treinamentos que ainda não têm avaliador atribuído são apresentados como **um único item consolidado** para os administradores ("N treinamentos aguardando atribuição de avaliador"), e não um item por treinamento: essa fila recebe toda conclusão de treinamento com critério de eficácia definido, e a listagem individual inundaria o painel.

**Impacto/área afetada.** Painel "Suas Pendências" (novo card e nova origem de pendência) e módulo de Aprendizagem. Como organização interna, os fragmentos de regra do quadro de eficácia foram movidos de um arquivo de rotas para um serviço compartilhado, mantendo a regra em um único lugar.

**Status e validações.** Concluído e pendente de revisão (PR em draft, não mergeado). Validações: `pnpm typecheck` sem erros; 49 testes de integração aprovados (7 novos do provedor, 21 do quadro de eficácia confirmando ausência de regressão na reorganização, 8 da rota do painel e 13 dos demais provedores); 11 testes de interface da página. Sem alteração de banco de dados.

**Pendente.** A verificação não foi feita na tela — a cobertura é de contrato de API e de interface em ambiente de teste. O risco residual é de layout, já que a faixa de cards do painel passou de cinco para seis colunas.
