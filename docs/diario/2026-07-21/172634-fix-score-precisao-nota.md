---
hora: "17:26"
autor: João Pedro
branch: fix/score-precisao-nota
modulo: Planos de Ação
titulo: Checklist de tarefas no "Como" das ações (mergeado)
---

## O que foi feito
Entregue e **mergeado** (PR #194) o recurso de **checklist de tarefas no campo "Como"** das ações do Plano de Ação. Por decisão do cliente, o "Como" passou a **ser** a checklist (sem texto livre): o responsável adiciona os passos a executar e vai marcando conforme conclui. Cada passo concluído registra **quando** e **quem** finalizou, exibido como "Concluída em dd/mm/aaaa · Nome". O card da ação recebeu um botão de expandir explícito ("Como, Por quê, Onde, Quanto"), pois o indicador anterior não deixava claro que havia mais detalhes.

## Por quê
Atende ao pedido de tornar o "Como" acionável — quebrar o método em tarefas acompanháveis, com registro de conclusão (data e autor) para fins de execução e auditoria.

## Impacto / área
Módulo **Planos de Ação** — editor das ações do plano. Mudança isolada; não afeta criação de planos, sugestão por IA, agregados/pendências ou exportações. O texto livre anterior do "Como" foi mantido no banco (dado legado preservado), apenas saiu da tela.

## Como
- Nova coluna `how_tasks` (jsonb) na tabela das ações; cada item guarda id, texto, conclusão e o carimbo de quem/quando. Sem tabela nova.
- O carimbo de conclusão é **controlado pelo servidor** (não é falsificável pelo cliente); desmarcar limpa, renomear preserva.
- Histórico: marcar/desmarcar (execução) não gera entrada; reestruturar a checklist (incluir/remover/renomear passo) é registrado.
- DDL aditiva e idempotente **já aplicada em produção** antes do merge.

## Status
**Concluído e mergeado na main** (squash). Deploy segue o fluxo normal (a coluna já existe em produção, então a ordem está segura).

## Validações
- `pnpm typecheck` OK (monorepo). Testes unitários (comportamento do card, normalização e carimbo no servidor) e um round-trip de integração — todos passando no CI.
- Revisores de IA (cubic e CodeRabbit) concluíram sem achados bloqueantes; os 3 apontamentos relevantes foram corrigidos antes do merge.
