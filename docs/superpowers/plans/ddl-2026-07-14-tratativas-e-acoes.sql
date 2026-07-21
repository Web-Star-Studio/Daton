-- DDL cirúrgico (Neon/produção) — Tratativas + Ações (Task 20)
--
-- ⚠️ NÃO EXECUTAR AUTOMATICAMENTE. Este arquivo é aplicado manualmente pelo
-- usuário no Neon de produção, DEPOIS do merge do PR — nunca via
-- `pnpm --filter @workspace/db push` (a branch pode estar atrasada em
-- relação ao schema de produção, e o push tentaria dropar colunas de
-- outras branches ainda não mergeadas).
--
-- Este DDL só ACRESCENTA:
--   - o enum `action_plan_analysis_method_key`
--   - a tabela `action_plan_analysis_methods` (catálogo de tratativas por org)
--   - a coluna `action_plans.analyses` (jsonb)
--   - a tabela `action_plan_actions` (uma linha por ação, 5W2H rastreável)
--   - 3 valores novos no enum `action_plan_activity_action`
--
-- NÃO toca em nada de eficácia (`effectiveness_method_id` etc. — essa
-- migração é de outro PR, #156, e este branch está atrás dela).
-- NÃO derruba `plan_5w2h` nem `root_cause_whys` — ficam como rede de
-- rollback para os dados legados, até um follow-up de limpeza.
--
-- Depois de aplicar este DDL, rode o backfill (idempotente):
--   pnpm --filter @workspace/scripts backfill-tratativas-e-acoes [--org=<id>]
--
-- ─────────────────────────────────────────────────────────────────────────

CREATE TYPE action_plan_analysis_method_key AS ENUM (
  'five_whys','ishikawa','a3','fmea','fault_tree','kepner_tregoe','rca_apollo','barrier_analysis'
);

CREATE TABLE action_plan_analysis_methods (
  id serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key action_plan_analysis_method_key NOT NULL,
  label text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX action_plan_analysis_method_org_key_unique
  ON action_plan_analysis_methods (organization_id, key);

ALTER TABLE action_plans ADD COLUMN analyses jsonb;

CREATE TABLE action_plan_actions (
  id serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  action_plan_id integer NOT NULL REFERENCES action_plans(id) ON DELETE CASCADE,
  what text,
  why text,
  where_at text,
  how text,
  how_much text,
  responsible_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  due_date timestamptz,
  status action_plan_status NOT NULL DEFAULT 'open',
  completed_at timestamptz,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX action_plan_actions_plan_idx ON action_plan_actions (action_plan_id, sort_order);
CREATE INDEX action_plan_actions_org_responsible_idx
  ON action_plan_actions (organization_id, responsible_user_id, status);

-- ALTER TYPE ... ADD VALUE não roda dentro de transação; execute uma por vez
-- (fora de um bloco BEGIN/COMMIT, cada uma como seu próprio statement).
ALTER TYPE action_plan_activity_action ADD VALUE IF NOT EXISTS 'action_added';
ALTER TYPE action_plan_activity_action ADD VALUE IF NOT EXISTS 'action_updated';
ALTER TYPE action_plan_activity_action ADD VALUE IF NOT EXISTS 'action_removed';
