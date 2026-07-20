---
hora: "14:50"
autor: João Pedro
branch: fix/lms-summary-ignora-rascunho-eficacia
modulo: Aprendizagem
titulo: Indicadores LMS: layout aprovado, exportação em PDF e coerência do exercício
---

## Contexto

A tela **Indicadores LMS** (módulo Aprendizagem) divergia do layout aprovado com a
cliente e o botão "Exportar relatório" apenas acionava a impressão do navegador.
Como o projeto não possui regras de CSS de impressão, o resultado saía com o menu
lateral e o cabeçalho da aplicação dentro do documento — impróprio para uso em
auditoria.

## O que foi entregue

**1. Tela alinhada ao layout aprovado — PR #174 (mergeado, `8df69ea6`)**

Reconstrução em duas colunas, com rótulos de seção, cards de indicador exibindo
situação, meta e barra de progresso, coluna de lacunas (Gap) na tabela por filial,
alerta da norma mais distante da meta e painel de ações geradas a partir de
treinamento.

Não se tratou apenas de ajuste visual: dois dos quatro indicadores previstos no
layout — **horas de treinamento por colaborador** e **percentual de cobertura de
treinamentos obrigatórios** — já eram calculáveis no servidor, mas nunca haviam
sido disponibilizados para a tela. Também foram exibidos os treinamentos vencidos
e as avaliações de eficácia pendentes, que a interface recebia e não apresentava.

As metas exibidas passaram a vir da configuração do módulo Indicadores (KPI) da
própria organização, e não de valores fixos na tela.

**2. Exportação em PDF real — PR #174**

O relatório passou a ser gerado como documento próprio, com cabeçalho de
organização, exercício e escopo, indicadores, gráfico por norma, tabelas e rodapé
paginado com a referência normativa. Foi acrescentada exportação em Excel com
múltiplas abas, para cruzamento de dados.

**3. Coerência do filtro de exercício — PR #177 (mergeado, `1b05bb26`)**

O seletor de exercício introduzido no item 1 evidenciou um problema anterior:
quatro campos da resposta ignoravam o ano selecionado. Em um exercício fechado, a
mesma linha da tabela por filial chegava a apresentar o cumprimento do ano
selecionado ao lado de uma eficácia calculada com avaliações de outro período.

Todos os campos passaram a adotar o mesmo recorte dos indicadores. O corte é
acumulado até o fim do período, e não restrito ao ano: treinamentos vencidos e
avaliações pendentes constituem passivo que não se encerra na virada do exercício
— um treinamento concluído em 2024 sem avaliação permanece pendente em 2026.

No mesmo PR, a meta passou a ser herdada do exercício anterior mais recente,
alinhando o comportamento ao do módulo Indicadores, e foi corrigida a herança da
tolerância na abertura de um novo exercício.

**Observação de impacto:** a correção também altera valores do exercício corrente.
Avaliações de períodos anteriores inflavam a eficácia por filial; os percentuais
passam a refletir apenas o exercício.

## Pendente

**PR #180 — aberto, aguardando revisão.** Identificado durante a preparação do
merge do #177: o rascunho de avaliação de eficácia (funcionalidade introduzida em
PR anterior) ainda é contabilizado como avaliação concluída nos indicadores. O
efeito mais relevante é que iniciar um rascunho remove o treinamento da lista de
pendências sem que a avaliação tenha sido concluída. A correção está implementada
e coberta por teste, aguardando aprovação.

## Validações

- `pnpm typecheck` sem erros em todo o workspace.
- Testes: 57 de interface (Aprendizagem), 179 unitários de servidor e 21 de
  integração, incluindo casos novos para herança de meta, recorte por exercício e
  tratamento de rascunho.
- Verificação em navegador com a aplicação em execução contra base descartável,
  sem acesso à base de produção. Três defeitos foram identificados apenas nessa
  verificação e corrigidos antes do merge.
- Nenhuma alteração de estrutura de banco (DDL) foi necessária nas três frentes.
