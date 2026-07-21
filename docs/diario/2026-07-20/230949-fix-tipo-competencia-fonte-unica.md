---
hora: "23:09"
autor: João Pedro
branch: fix/tipo-competencia-fonte-unica
modulo: Aprendizagem
titulo: Tipo da competência com fonte única (catálogo) + correção de dados
---

## Tipo da competência com fonte única (Aprendizagem)

**O que foi feito:** corrigido o problema relatado pela cliente — competência cadastrada como "Conhecimento" no catálogo aparecia como "Habilidade" ao ser vinculada a um cargo. A investigação mostrou que a queixa visual era a ponta de um problema funcional: o mecanismo que reconhece um treinamento como prova de uma competência do cargo compara nome **e** tipo; quando o tipo divergia, o treinamento não era reconhecido e o cargo continuava acusando lacuna mesmo com o curso feito.

**Solução:** o tipo de uma competência passou a ter **uma única fonte de verdade — o catálogo**. Ao vincular uma competência a um cargo, o sistema usa o tipo do catálogo, e o formulário deixou de ter um campo de tipo editável para competências já cadastradas (só ao criar uma competência nova é que o tipo é pedido). O vocabulário de tipos foi alinhado ao que os dados realmente usam (Conhecimento, Habilidade, Atitude), removendo dois valores herdados que nunca existiram na prática. Blindagens foram acrescentadas para que cargas futuras e telas de edição nunca reintroduzam valores fora desse vocabulário.

**Impacto/área:** módulo Aprendizagem — catálogo de competências, competências do cargo, ficha do colaborador e o elo treinamento↔competência.

**Correção de dados em produção (aplicada e verificada):**
- 11 competências de cargo que estavam com o tipo divergente do catálogo foram alinhadas ao catálogo — o que, além de corrigir a exibição, restabelece o reconhecimento dos treinamentos correspondentes. Entre elas, as competências de "Formação de Auditor Interno" citadas pela cliente, que voltaram a ser "Conhecimento".
- 7 competências de colaborador que carregavam valores herdados foram normalizadas.
- O valor padrão da coluna de tipo no banco foi alinhado ao novo vocabulário.
- Rollback capturado antes da aplicação (18 registros, com o valor original de cada um); verificação independente após a aplicação confirmou zero divergências e zero valores fora do vocabulário.

**Status:** código MESCLADO na linha principal (deploy automático); correções de dados e ajuste de padrão do banco aplicados em produção.

**Validações:** verificação de tipos sem erros; 90 testes de interface do módulo; testes de integração das rotas de competência, catálogo e do mecanismo de reconhecimento. Validação em navegador do fluxo completo (vincular uma competência "Conhecimento" e confirmar que aparece como Conhecimento; enviar deliberadamente o tipo errado pela API e confirmar que o sistema grava o do catálogo).

**Observação de processo:** o revisor automático apontou, ao longo de várias rodadas, uma série de pontos decorrentes da mesma mudança (o estreitamento do vocabulário exigia normalizar valores herdados em cada tela que os exibia ou editava). Todos foram tratados e verificados antes da publicação; ficam registrados como aprendizado de que uma mudança de vocabulário precisa varrer todos os pontos de escrita e edição, não só o ponto de origem.
