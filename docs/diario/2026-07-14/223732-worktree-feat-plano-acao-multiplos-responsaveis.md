---
hora: "22:37"
autor: João Pedro
branch: worktree-feat-plano-acao-multiplos-responsaveis
modulo: Gestão de Ações
titulo: Plano de ação: ponto focal + co-responsáveis
---

## O que foi feito

Implementamos, com testes, a capacidade de o plano de ação ter mais de um responsável —
pedido da cliente. O modelo final: cada plano tem um **ponto focal** (quem responde por ele) e
pode ter **vários co-responsáveis** vinculados. O plano nasce com o ponto focal; os
co-responsáveis são adicionados dentro da ficha. Entregue como PR #158 (rascunho).

## Por quê

A regra de negócio foi revalidada com a cliente ao longo do dia e o modelo amadureceu para
"ponto focal + co-responsáveis" (em vez de uma lista plana de responsáveis iguais). A escolha
evita cobrar automaticamente alguém sem tarefa definida e mantém uma única fonte de verdade sobre
quem responde formalmente pelo plano.

## Entrega

Mudança **aditiva** — nada do que já existia foi quebrado:
- O campo de responsável que já existia passou a significar "ponto focal"; nenhuma migração de
  dado foi necessária.
- Os co-responsáveis vivem numa estrutura nova, à parte.
- Um co-responsável recebe o mesmo tratamento do ponto focal em todos os pontos onde o sistema
  cobra ou dá acesso: abre a ficha mesmo sem permissão no módulo, recebe o e-mail e o alerta de
  ação vencida, e vê a ação no painel pessoal "Suas Pendências". A independência do avaliador de
  eficácia (quem verifica não pode ser quem executa, exigência ISO) foi estendida para todo o
  grupo de responsáveis.
- Como melhoria de brinde, o histórico da ação deixou de exibir identificadores numéricos crus na
  troca de responsável e passou a mostrar nomes.
- Na experiência: a criação do plano pede só o ponto focal (para não sobrecarregar o momento de
  captura), e a listagem/painel passam a resumir o time como "Fulano +2".

## Reconciliação com o catálogo de métodos de verificação (PR #156)

A frente de trabalho havia começado antes de o catálogo de métodos de verificação (#156) entrar
na base principal. As duas mudanças tocavam os mesmos arquivos da ficha do plano. Fizemos a
integração das duas e validamos que ambas convivem: as duas baterias de teste automatizado passam
juntas e a verificação de tipos do projeto está limpa. Sem essa reconciliação, subir esta frente
teria conflitado com uma funcionalidade que já está em produção.

## Status

- Código: **completo e testado** (backend, contrato, frontend), em PR rascunho (#158).
- Testes: nossa bateria de integração 45/45; a bateria do catálogo de métodos 7/7; testes de
  interface 17/17; verificação de tipos do projeto inteiro sem erros.
- **Pendente:** a estrutura de dados de PRODUÇÃO ainda **não foi aplicada** — o script está pronto
  (idempotente e sem necessidade de recarga de dados, pois o responsável atual já é o ponto focal),
  aguardando autorização explícita para rodar no banco de produção.

## Próximo passo

Quando a funcionalidade de múltiplas ações dentro de um plano (em construção em paralelo) existir,
o vínculo dos co-responsáveis passará do nível do plano para o nível de cada ação.
