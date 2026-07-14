---
hora: "16:09"
autor: João Pedro
branch: worktree-feat-plano-acao-multiplos-responsaveis
modulo: Gestão de Ações
titulo: Plano de ação: definição do modelo de responsáveis (ponto focal + responsáveis por ação)
---

## O que foi feito

Fechamos a definição de como o plano de ação passa a comportar mais de um responsável — pedido
da cliente. O resultado é uma **decisão de desenho documentada**, não código: a implementação
pertence à frente de "múltiplas ações dentro do plano", que está sendo conduzida em paralelo.

## Por quê

A regra de negócio foi revalidada com a cliente **duas vezes** ao longo do dia. A primeira leitura
era "conjunto plano": N responsáveis iguais, sem hierarquia. Chegamos a implementar a fundação
disso (tabela de junção de responsáveis, serviço e testes de integração). Na revalidação seguinte
a cliente definiu o modelo real: existe um **ponto focal** do plano, e os demais responsáveis se
vinculam às **ações internas** — cada ação com responsável e prazo próprios.

Com esse modelo, a tabela de junção vira código morto: o plano mantém a coluna de responsável que
já existe, que passa a significar "ponto focal", sem migração nenhuma; a multiplicidade migra para
a tabela de ações. **O código foi revertido** — melhor descartar uma etapa agora do que carregar
estrutura sem uso para dentro do produto.

## Entrega

Documento de desenho e passagem (PR #155, sem código), contendo:

- **O modelo:** ponto focal no plano; responsável e prazo em cada ação; a lista de "outros
  responsáveis" do plano é **derivada** dos donos das ações, nunca cadastrada à parte — duas listas
  divergiriam, e um co-responsável sem ação receberia cobrança automática sem tarefa nem prazo.
- **Decisão de experiência:** na criação do plano pede-se apenas o ponto focal; os demais entram ao
  criar cada ação, dentro da ficha. Nomear uma pessoa e atribuir a tarefa a ela passam a ser o mesmo
  gesto — que é a disciplina do 5W2H que o módulo existe para impor.
- **Mapa técnico dos cinco mecanismos** que hoje dependem do campo de responsável (acesso à ficha,
  painel de pendências pessoais, cobrança automática por e-mail, filtro "atribuídas a mim" e a regra
  de independência do avaliador de eficácia). Cada um precisará decidir se passa a operar no nível
  da ação. Esse mapa é o insumo direto da frente de múltiplas ações.
- **Armadilhas de infraestrutura** encontradas e registradas, com impacto real de risco: comandos de
  schema que apontam para o banco de produção, e o banco de teste compartilhado entre sessões
  paralelas (outra sessão removeu uma tabela no meio da nossa suíte de testes).

## Status

- Decisão de modelo: **concluída e aprovada**.
- Código de responsáveis múltiplos: **revertido** por mudança de regra (histórico preservado).
- Implementação: **pendente**, e pertence à frente de múltiplas ações por plano (em andamento em
  paralelo). Nada foi aplicado em produção.

## Validações

`pnpm typecheck` limpo após a reversão. Os testes de integração da estrutura revertida passavam
(5/5) antes do descarte.
