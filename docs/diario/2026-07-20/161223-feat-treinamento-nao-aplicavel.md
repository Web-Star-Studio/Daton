---
hora: "16:12"
autor: João Pedro
branch: feat/treinamento-nao-aplicavel
modulo: Aprendizagem
titulo: Treinamentos: opção Não aplicável com motivo obrigatório (+ DDL de prod)
---

## Treinamentos: opção "Não aplicável" com motivo obrigatório (Aprendizagem)

**O que foi feito:** atendido o pedido do time de RH da cliente — na tela de registro de conclusão de um treinamento, passa a existir a opção **"Não aplicável"**; ao selecioná-la, abre-se um campo de **motivo de preenchimento obrigatório**, e a gravação fica bloqueada enquanto ele estiver vazio. Os campos de data de conclusão e validade são desabilitados nesse status, e o registro passa a exibir, na ficha do colaborador, uma marcação neutra com o motivo declarado.

**Por quê:** quando um treinamento simplesmente não se aplica a determinada pessoa (mudança de função, atividade não executada, dispensa técnica), não havia como registrar isso. O item permanecia como pendência para sempre, sendo cobrado em todas as telas e puxando os indicadores de conformidade para baixo.

**O trabalho por trás do pedido:** a opção na lista foi a menor parte. O essencial foi garantir que um treinamento assim marcado **saia de todas as contagens de obrigação** do módulo — caso contrário, o RH marcaria a opção e o item continuaria sendo cobrado em outra tela. Foram ajustados: as contagens e filtros da tela de Gestão de Treinamentos, os contadores da ficha, o percentual de conclusão exibido na lista de colaboradores, o indicador de cobertura de treinamentos obrigatórios, o quadro de avaliação de eficácia e o mecanismo que gera automaticamente as pendências a partir das obrigatoriedades do cargo — este último era o mais crítico: sem o ajuste, o item marcado como não aplicável **reapareceria** como pendência na próxima mudança de cargo.

**Ponto de atenção encontrado na revisão:** o levantamento inicial dos pontos afetados usou um critério incompleto, que não alcançava indicadores cujo denominador não filtra situação alguma. A revisão final identificou três casos assim — incluindo o indicador de cobertura obrigatória, que ficaria travado abaixo da meta permanentemente. Todos foram corrigidos e cobertos por testes antes da entrega.

**Impacto/área:** módulo Aprendizagem — ficha do colaborador, Gestão de Treinamentos, indicadores, quadro de eficácia e geração automática de pendências.

**Alteração em produção:** aplicada uma coluna nova (opcional, para o motivo) na tabela de treinamentos. Operação aditiva, sem preenchimento retroativo e sem alteração de nenhum registro existente — verificada antes e depois: contagem de registros inalterada, nenhum dado migrado.

**Status:** implementado, revisado e validado em navegador; **PR aberto em rascunho**, aguardando aprovação para publicação.

**Validações:** verificação de tipos sem erros; 62 testes de interface do módulo; testes de integração cobrindo as rotas de treinamentos, eficácia, catálogo, indicadores e resumo. Validação manual em navegador do fluxo completo (seleção da opção, obrigatoriedade do motivo, bloqueio da gravação, exibição na ficha e ausência do item nas telas de cobrança).

**Registrado para tratar em separado:** existe na base de produção um quarto valor de situação (`em_andamento`) que nunca foi declarado no contrato da API. Ele não faz parte desta entrega, mas ficou mais aparente agora que os totais passaram a fechar com a soma das partes.
