-- Visibilidade por papel no hub de Ações (spec 2026-07-15).
-- Aditivo + idempotente: acrescenta a filial DERIVADA do plano (null = corporativo).
--
-- Ordem de aplicação:
--   1. esta DDL            (aditiva; o código antigo ignora a coluna nova)
--   2. o backfill          (scripts/src/migrate/action-plans-unit-backfill.ts)
--   3. o deploy do código  (que passa a escopar a visibilidade por papel)
--
-- Sem a coluna, o deploy quebra (a listagem/summary/requirePlanAccess a consultam).
-- Sem o backfill, todo plano existente fica com unit_id nulo = CORPORATIVO, e todo
-- gestor veria todos os planos antigos — por isso o backfill vai antes do deploy.

ALTER TABLE action_plans ADD COLUMN IF NOT EXISTS unit_id integer REFERENCES units (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS action_plans_org_unit_idx ON action_plans (organization_id, unit_id);
