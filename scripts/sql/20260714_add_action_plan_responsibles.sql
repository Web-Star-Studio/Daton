-- Co-responsáveis do plano de ação (spec 2026-07-14).
-- Idempotente: pode rodar mais de uma vez sem efeito colateral.
--
-- SEM BACKFILL, de propósito: `action_plans.responsible_user_id` já contém o ponto
-- focal de cada plano e continua com o mesmo significado. Esta tabela nasce vazia e
-- guarda apenas os CO-responsáveis. O código antigo a ignora, então a ordem de
-- deploy não é crítica.

CREATE TABLE IF NOT EXISTS action_plan_responsibles (
  id              serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations (id),
  action_plan_id  integer NOT NULL REFERENCES action_plans (id) ON DELETE CASCADE,
  user_id         integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS action_plan_responsibles_plan_user_uq
  ON action_plan_responsibles (action_plan_id, user_id);
CREATE INDEX IF NOT EXISTS action_plan_responsibles_user_idx
  ON action_plan_responsibles (user_id);
CREATE INDEX IF NOT EXISTS action_plan_responsibles_org_idx
  ON action_plan_responsibles (organization_id);
