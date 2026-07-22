---
hora: "16:55"
autor: João Pedro
branch: feat/prazo-regularizacao-gap
modulo: Aprendizagem
titulo: Prazo de regularização de gap (escolaridade + competência) — Fase 1
---

## Prazo de regularização de gap (escolaridade + competência) — Fase 1

**O que foi feito:** entrega da Fase 1 (persistência + visibilidade) do pedido de acompanhamento de gap: permitir definir um prazo de regularização quando um colaborador não atende um requisito do cargo (escolaridade ou competência), manter o gap visível — inclusive marcado como "vencido" quando o prazo passa sem o requisito ser atendido — e resolver automaticamente o prazo quando o colaborador passa a atender.

**Por quê:** a cliente validou a correção de escolaridade (ver entrada anterior, PR #198) e pediu o próximo passo com um mockup próprio: um campo "Prazo para regularização" na linha do gap, e que "o perfil do adm precisa receber que este funcionário continua com gap" quando o prazo vence.

**Escopo desta entrega:** persistência do prazo, self-healing (resolução automática ao recomputar a conformidade em cada leitura da ficha) e a UI do mockup — para escolaridade E para competências do cargo, no mesmo layout. A notificação em si ao administrador (escalonamento diário + notificação/e-mail) fica para uma Fase 2 separada, nos moldes do que já existe hoje para planos de ação vencidos.

**Impacto/área afetada:** módulo Aprendizagem → ficha do colaborador (painel "Formação e qualificações"). Nova tabela `employee_gap_deadlines` (DDL ainda não aplicada em produção — pendente até o merge). Novos endpoints `POST/DELETE .../employees/:empId/gaps/deadline`; `GET .../employees/:empId` passa a expor o prazo por requisito.

**Status:** concluído (Fase 1). PR #201 aberto em modo draft (`feat/prazo-regularizacao-gap`), empilhado sobre o PR #198 (`fix/escolaridade-cargo-vocabulario`) — depende do merge de #198 primeiro. Fase 2 (notificação ao admin) ainda não iniciada, aguardando esta entrega ser revisada.

**Validações:**
- `pnpm typecheck` (raiz — libs + web + api-server + e2e) sem erros.
- Testes de integração novos (7 casos, banco isolado): criação de prazo, self-healing ao atender o requisito, prazo vencido, upsert reabre prazo existente, remoção, validação de campos obrigatórios, permissão de analyst. Sem regressão nos 21 testes de integração existentes de colaboradores/competências.
- Testes unitários novos: 6 (porta server-side da comparação de escolaridade, mesmos casos da versão do frontend) + 6 (serviço de prazos) + 7 (interface do prazo na ficha). Sem regressão nos 111 testes existentes do módulo de Aprendizagem no frontend.
- Não testado em navegador nesta rodada (instrução do projeto: não subir servidor de desenvolvimento sem pedido explícito) — validação por checagem de tipos e suíte de testes automatizados.
