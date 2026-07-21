-- Checklist de tarefas ("passos") do campo "Como" de cada ação do plano.
-- Idempotente: pode rodar mais de uma vez sem efeito colateral.
--
-- Aditivo e SEM BACKFILL: coluna anulável que guarda um array jsonb de itens
-- `{ id, text, done }`. Ações antigas ficam com NULL (o código trata como lista
-- vazia). O código anterior ignora a coluna, então a ordem de deploy não é crítica.

ALTER TABLE action_plan_actions
  ADD COLUMN IF NOT EXISTS how_tasks jsonb;
