# Safe rollout for organization-scoped nonconformity references

This repository is now in the **phase 2** state of the rollout.

That means the schema once again declares:

- composite foreign keys from `nonconformities` to `(organization_id, id)` on referenced tables
- `NOT NULL` on:
  - `internal_audit_findings.organization_id`
  - `strategic_plan_risk_opportunity_items.organization_id`

Do **not** run `pnpm --filter @workspace/db push` for this phase until phase 1 has already been applied and verified on the target branch.

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

## Phase 2 rollout order

Once `dev` and `production` are fully backfilled, update the application code to this phase-2 state and then run:

```bash
pnpm --filter @workspace/db push
```

Expected result:

- the five composite foreign keys on `nonconformities` can now be created successfully
- `internal_audit_findings.organization_id` can become `NOT NULL`
- `strategic_plan_risk_opportunity_items.organization_id` can become `NOT NULL`

## Verification after phase 2

- a direct cross-org write to `nonconformities.audit_finding_id` must fail in PostgreSQL
- normal same-org links must still succeed
