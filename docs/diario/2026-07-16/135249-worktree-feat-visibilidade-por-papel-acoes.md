---
hora: "13:52"
autor: João Pedro
branch: worktree-feat-visibilidade-por-papel-acoes
modulo: Gestão de Ações
titulo: Visibilidade por papel: cada pessoa vê apenas as ações que lhe dizem respeito
---

## O que foi feito

O painel de Gestão de Ações passou a **respeitar o papel de cada usuário**. Antes, qualquer pessoa
com acesso ao módulo enxergava **todas** as ações da empresa — inclusive um operador, que via ações
de outras áreas e filiais sem relação com o trabalho dele. Agora:

- **Operador** — vê apenas as ações às quais está vinculado (como ponto focal, co-responsável ou
  avaliador).
- **Gestor** — vê as ações da filial dele, mais as corporativas, mais aquelas em que está vinculado.
- **Administrador** — vê tudo.
- **Auditor (perfil de leitura)** — vê tudo, sem poder alterar.

## Por quê

Pedido do cliente após testar a plataforma: informação demais na tela gera confusão e expõe dados
sem necessidade. A regra adotada é a **mesma já usada no módulo de Indicadores**, o que mantém a
plataforma coerente — o usuário não precisa aprender duas lógicas diferentes de visibilidade.

## Como a filial de uma ação é determinada

Uma ação não tinha filial (ela nasce de várias áreas: indicador, SWOT, não conformidade, ou é
criada manualmente). A filial passou a ser **herdada automaticamente**, sem ninguém precisar
escolher:

- Ação vinculada a outra área → herda a filial daquela área de origem.
- Ação criada manualmente → herda a filial do ponto focal.
- Quando não há filial identificável (origem corporativa, por exemplo) → a ação é tratada como
  **corporativa** e fica visível a todos os gestores.

## Escopo da proteção

A restrição vale nos **três** pontos onde a informação aparece: na listagem, ao abrir uma ação
diretamente pelo endereço, e nos painéis/indicadores do módulo — de modo que os números do painel
passam a refletir exatamente o que a pessoa pode ver. As ações corretivas trazidas do módulo de
governança, que não possuem filial nem responsável identificável, passaram a ser exibidas somente a
quem já enxerga a organização inteira.

Fluxos preservados (verificados): quem é responsável por uma ação continua acessando-a pelo painel
pessoal de pendências mesmo sem permissão no módulo; e quem cuida de uma área de origem (um
indicador, por exemplo) continua vendo as ações ligadas àquela área.

## Status

- Código: **completo e testado**, em PR de rascunho (#164). Verificações automatizadas e checagem
  de tipos passando.
- **Pendente:** a estrutura de dados de PRODUÇÃO ainda **não foi criada**, e a **carga que preenche
  a filial das ações já existentes ainda não foi executada** — ambas aguardam autorização. Sem essa
  carga, as ações antigas ficariam todas como "corporativas" e os gestores continuariam vendo tudo.
  A ordem correta é: criar a estrutura → rodar a carga → publicar o código.
