---
hora: "11:24"
autor: João Pedro
branch: feat/gestao-treinamentos-paridade
modulo: Aprendizagem
titulo: Gestão de Treinamentos: validação em navegador, correção da listagem e merge
---

## Gestão de Treinamentos: validação em navegador, correção e entrega (Aprendizagem)

**O que foi feito:** a tela de Gestão de Treinamentos foi validada ponta a ponta em navegador (ambiente local) antes da entrega e, em seguida, **mesclada** à linha principal.

**O que a validação encontrou:** as colunas **Norma** e **Crítico**, recém-adicionadas, apareciam vazias para **todas** as linhas. A causa não estava na tela: a listagem de treinamentos do servidor montava a resposta enumerando os campos manualmente e **omitia três** deles (o vínculo com o item de catálogo, o vínculo com a obrigatoriedade e o prazo), embora já fossem buscados e já constassem do contrato da API. Sem esses vínculos, a tela não tinha como resolver a norma nem a criticidade, e o vencimento perdia o campo de prazo como alternativa. Corrigido, com teste de regressão — nenhum teste cobria isso, e o problema só apareceu ao olhar a tela.

**Conferência com os dados:** após a correção, os cinco indicadores do topo bateram exatamente com a consulta feita direto na base (vencidos, a vencer, pendentes, programados e realizados no mês), a visão por turma exibiu o funil inscritos → confirmados → realizados, e o painel "Por prazo" listou corretamente os pendentes **sem turma**, excluindo quem já tem turma marcada.

**Integração com o restante do time:** durante o trabalho, outras entregas do módulo foram incorporadas à linha principal. A integração exigiu conciliar uma duplicidade: outra entrega já publicava a contagem de "realizados" por turma sob outro nome. Mantivemos um único campo para o mesmo valor, evitando duas fontes para a mesma informação, e adotamos a consulta mais eficiente que a outra entrega trouxe.

**Impacto/área:** módulo Aprendizagem — tela de Gestão de Treinamentos e a rota de listagem de treinamentos (compartilhada com outras telas do módulo). **Sem alteração de schema em produção.**

**Status:** **MESCLADO** na linha principal; entra no próximo deploy automático.

**Validações:** verificação de tipos sem erros; 57 testes de interface do módulo; 7 testes de integração das rotas envolvidas; validação visual em navegador com dados conferidos contra a base.

**Observação registrada:** três testes de integração de outros módulos (governança, aspectos ambientais e um de treinamentos) falham também na linha principal, sem relação com esta entrega — a verificação automática obrigatória do repositório não cobre a suíte de integração, então essas falhas passavam despercebidas. Ficam registradas para tratamento em separado.
