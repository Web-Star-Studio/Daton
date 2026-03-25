# Safe rollout for organization-scoped nonconformity references

This repository is intentionally in the **phase 1** state of the rollout.

What phase 1 includes:

- composite unique constraints on referenced tables that already have `organization_id`
- `organization_id` columns on:
  - `internal_audit_findings`
  - `strategic_plan_risk_opportunity_items`
- application-level validation that keeps cross-org links rejected in the API

What phase 1 intentionally does **not** include yet:

- composite foreign keys from `nonconformities` to `(organization_id, id)` on referenced tables
- `NOT NULL` enforcement on the newly added `organization_id` columns above

This split exists because `drizzle-kit push` cannot safely apply the prerequisite constraints, denormalized columns, backfill, and composite foreign keys in one shot on a live database.

## Phase 1 rollout order

Run these steps on `dev` first, then repeat on `production`.

1. Push the phase-1 schema:

```bash
pnpm --filter @workspace/db push
```

When Drizzle asks whether to truncate tables like `users` or `documents`, answer:

- `No, add the constraint without truncating the table`

2. Backfill the new governance `organization_id` columns:

```bash
pnpm --filter @workspace/scripts backfill-governance-org-scopes
```

Optional verification-only run:

```bash
pnpm --filter @workspace/scripts backfill-governance-org-scopes --verify-only
```

3. Verify there are no remaining mismatches:

- `strategic_plan_risk_opportunity_items.organization_id` must match `strategic_plans.organization_id`
- `internal_audit_findings.organization_id` must match `internal_audits.organization_id`

## Phase 2 follow-up

Once `dev` and `production` are fully backfilled, the follow-up schema change can:

- re-enable the five composite foreign keys on `nonconformities`
- make `internal_audit_findings.organization_id` `NOT NULL`
- make `strategic_plan_risk_opportunity_items.organization_id` `NOT NULL`

Only after that second schema change should you run another `pnpm --filter @workspace/db push`.
