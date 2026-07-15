---
hora: "12:11"
autor: João Pedro
branch: chore/carga-gabardo-cpf
modulo: Aprendizagem
titulo: Catálogo de treinamentos: filtro por status + arquivamento dos 2.715 itens de histórico
---

## O que foi feito

A pedido da cliente (Ana), o **catálogo de treinamentos** da Transportes Gabardo foi esvaziado da vista principal, para que ela recomece o cadastro do zero, sem perder nada.

- **PR mergeado (#159):** a aba de Catálogo passa a mostrar **só os treinamentos ativos por padrão**, com um seletor "Ativos / Inativos / Todos". Antes ela listava todos os itens, marcando os inativos apenas com um selo.
- **2.715 itens arquivados** (status → inativo) em produção. **Nenhum foi apagado** — continuam no banco, acessíveis pelo filtro "Inativos", e servem de histórico.

## Por quê

A carga de histórico de treinamentos, além de povoar a ficha de cada colaborador (o objetivo), também acabou criando 2.715 entradas no catálogo — que são registros de reuniões e orientações de dias específicos, não treinamentos reutilizáveis. Isso poluía a tela de catálogo e confundia a cliente. O histórico do colaborador não depende dessas entradas (cada registro guarda seu próprio título, data e carga horária).

## Impacto

- Catálogo ativo: 2.715 → **0** (a cliente recomeça o cadastro do zero).
- Itens preservados como arquivados: **2.715** (reversível).
- Turmas, obrigatoriedades e programa anual que a cliente já havia configurado: **intactos** (arquivar não apaga vínculos).
- Histórico de treinamento dos colaboradores: **intacto** (97.354 registros).

## Validações

- Ferramenta de inativação com 30 testes (contra banco local), incluindo a prova de que arquivar um item **não** apaga as turmas/obrigatoriedades vinculadas.
- PR #159 com revisão (humana assistida + automática), `pnpm typecheck` verde.
- Pós-operação em produção conferida: catálogo com 0 ativos, dependências e histórico intactos.
- Operação reversível por manifesto (voltar os 2.715 para ativo), guardado fora do ambiente de trabalho.

## Ponto em aberto (a alinhar com a cliente)

Na tela de **avaliação de eficácia**, a opção "mostrar todos" traz também os treinamentos históricos (são muitos). No modo padrão a tela já os ignora corretamente. Falta definir com a cliente se o "mostrar todos" deve esconder o histórico puro.
