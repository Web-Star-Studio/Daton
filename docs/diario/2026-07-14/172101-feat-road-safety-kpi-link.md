---
hora: "17:21"
autor: João Pedro
branch: feat/road-safety-kpi-link
modulo: Segurança Viária
titulo: Diagnóstico do Fator de Desempenho: periodicidade, autor e histórico
---

## Segurança Viária — Diagnóstico do Fator de Desempenho: periodicidade, autor e histórico

**O que foi feito.** O campo "Diagnóstico atual" do Fator de Desempenho (ISO 39001 §6.3) era um texto livre, sobrescrevível, sem autor e sem data — cada edição apagava a anterior, sem deixar rastro. Ele passou a ser um **histórico append-only**, com trilha de auditoria:

- **Periodicidade de revisão do diagnóstico** escolhida na criação do fator, independente da periodicidade de monitoramento do indicador. Vazia = "sem revisão programada" (padrão), para que os fatores já existentes não nasçam vencidos.
- **Autor e data em cada registro.** O autor é carimbado pelo servidor (o cliente não escolhe quem assina). Data de referência é escolhida, com hoje como padrão; data futura é rejeitada — num histórico append-only, um ano digitado errado viraria "o último diagnóstico" para sempre, e nenhuma correção conseguiria superá-lo.
- **Sem editar e sem apagar**: corrigir é registrar um diagnóstico novo. A ficha do fator mostra o último (texto, autor, data, vencimento) e o histórico completo.
- **O vencimento cobra o responsável**: badge no painel de fatores (em dia / vence em N dias / vencido) e pendência no painel "Suas Pendências". Registrar o diagnóstico encerra a pendência.
- **Migração**: o texto legado vira o primeiro registro do histórico, com autoria explicitamente não registrada (não se inventa autor). O importador da planilha da Gabardo foi corrigido para escrever no histórico, e não mais na coluna que ninguém lê — sem isso, um reimport recriaria o problema.

**Por quê.** O diagnóstico é a evidência que sustenta a análise GUT (a priorização do fator). Sem cadência, ninguém revisa; sem autor e data, não há o que mostrar numa auditoria. Pedido da cliente.

**Impacto.** Módulo Segurança Viária (ficha do fator, painel) e painel pessoal "Suas Pendências". A API continua devolvendo o campo `currentDiagnosis` (agora derivado do histórico), então nada que consumia o campo quebrou.

**Validações.** `pnpm typecheck` limpo; 178 testes unitários (backend) e 28 no front do módulo; 21 testes de integração cobrindo os endpoints, o provider de pendências e o isolamento entre organizações. As falhas remanescentes da suíte (2 de integração, 3 de front) foram verificadas como **pré-existentes** — falham igualmente na main limpa.

**Status.** PR #110 aberto, CI verde, pronto para merge. **Não mergeado**: o merge dispara o deploy automático, e o banco de produção precisa receber a estrutura nova e o backfill do texto legado **antes** — a ordem está descrita no corpo do PR. Aguardando autorização.

**Entregue junto** (trabalho anterior, no mesmo PR): vínculo entre Fator de Desempenho e Indicador (KPI), que estava pronto desde 26/06 e nunca havia sido mergeado.
