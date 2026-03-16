# Schema Push Notes

## Organization onboarding cutover

The `organizations` schema now treats these canonical columns as the source of truth:

- `trade_name`
- `legal_identifier`
- `state_registration`
- `opening_date`

This cutover intentionally removes support for the older physical columns:

- `nome_fantasia`
- `cnpj`
- `inscricao_estadual`
- `data_fundacao`
- `legal_name`

### Important

Running `pnpm --filter @workspace/db push` with this schema is destructive for environments that still store relevant data only in the legacy columns above.

This repository currently assumes those legacy columns are disposable in the target environment for this onboarding rollout. Do **not** push this schema to an environment that still depends on those columns without doing a data copy first.

### Safe usage

- Safe: fresh environments or environments where the canonical columns already contain the required organization data.
- Unsafe: environments where organization data still lives only in the legacy columns.
