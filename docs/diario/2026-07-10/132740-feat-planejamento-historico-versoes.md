---
hora: "13:27"
autor: João Pedro
branch: feat/planejamento-historico-versoes
modulo: Planos de Ação
titulo: Histórico de versões do Planejamento, com restaurar
---

## Planos de Ação — histórico de versões do Planejamento, com restaurar

**PR:** #145 (squash em `main`, SHA `cc37083`) — funcionalidade nova. Sem tabela nova
(reaproveita o registro de atividade já existente).

**Origem:** ao corrigir o salvamento automático (#144), ficou claro um problema maior — o
bloco de **Planejamento** de um plano de ação (o plano de ação em si, no formato 5W2H, mais
a causa-raiz e os 5 porquês) podia ser sobrescrito **sem deixar rastro de quem alterou nem
do que havia antes**. É justamente o conteúdo mais trabalhoso de escrever, e o que a IA
gera. A cliente pediu, em vez de só evitar a sobrescrita, poder **ver as versões e voltar**.

**O que foi feito:**
- **Cada alteração do Planejamento vira uma versão registrada,** com autor, data/hora e o
  conteúdo anterior completo.
- **Um botão "Versões" na ficha** mostra o histórico: quem mudou, quando, e o que mudou por
  campo. Edições seguidas da mesma pessoa em poucos minutos aparecem agrupadas como uma
  versão só, para o histórico ficar legível — mas o registro de auditoria continua completo
  por baixo.
- **Botão "Restaurar"** em cada versão anterior traz o conteúdo daquela versão de volta.
  Restaurar **nunca apaga nada**: é registrado como uma nova versão, e dá para voltar de
  novo. Quem pode editar o plano pode restaurar.
- **Melhoria de usabilidade junto:** o 5W2H e a causa-raiz, que eram dois blocos separados
  (com o botão da IA num deles preenchendo os dois), foram unificados numa única etapa
  **Planejamento** — como o passo já se chamava no topo da ficha.

**Impacto/área:** ficha de Plano de Ação. Fecha uma lacuna de rastreabilidade importante
para auditoria (ISO), e dá à cliente a capacidade de desfazer alterações do plano.

**Ponto de atenção para comunicar à cliente:** **não há histórico retroativo** — os planos
que já existiam começam a acumular versões só a partir da publicação. Ao abrir um plano
antigo, o histórico estará vazio até a primeira nova alteração.

**Validações:** funcionalidade construída em etapas, cada uma com testes automatizados e
revisão independente; verificada no navegador (criar versões, agrupar edições, restaurar,
persistência após recarregar) e nos limites (restaurar plano encerrado, sem permissão,
etc.); a revisão automática apontou seis situações reais — inclusive uma que tornaria a
funcionalidade incompleta — todas corrigidas e reverificadas antes do merge.

**Status:** concluído, mergeado e em produção.
