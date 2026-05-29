# Migração LAIA v1 (Supabase) → v2 (Drizzle/Neon)

ETL completo das 5 tabelas LAIA do projeto Supabase `dqlvioijqzlvnvvajmft` (Daton ESG Insight v1) para o schema atual em `feat/laia-v2-refresh`.

## Arquitetura

Tudo dentro do mesmo banco Postgres v2 (Neon prod). Schema isolado `_migration` recebe os dados v1 e o transform faz INSERT em `public.laia_*` resolvendo FKs.

```
v1 Supabase                _migration schema           public schema (v2)
                                                       
companies            ──►   v1_companies         ──┐
branches             ──►   v1_branches           ─┤
profiles             ──►   v1_profiles           ─┤  ┌── lookups + id_map ──►  laia_sectors
laia_sectors         ──►   v1_laia_sectors       ─┼──┤                          laia_branch_configs
laia_branch_config   ──►   v1_laia_branch_config ─┼──┤  02-transform.sql        laia_assessments
laia_assessments     ──►   v1_laia_assessments   ─┤  └──                       laia_requirement_links
laia_revisions       ──►   v1_laia_revisions     ─┤                             laia_revisions
laia_revision_changes──►   v1_laia_revision_chs ──┘                             laia_revision_changes
```

## Arquivos

| Arquivo | Propósito |
|---|---|
| `01-staging-schema.sql` | DDL idempotente: cria schema `_migration` com tabelas espelho do v1 + auxiliares `id_map`, `skipped`, `config`. **JÁ APLICADO EM PROD.** |
| `02-transform.sql` | ETL transacional. Mapeia user/unit/org, migra sectors → branch_configs → assessments → requirement_links → revisions → revision_changes. Idempotente via `id_map`. |
| `03-validate.sql` | Queries de contagem + checagem FK + distribuição por status/significance/category. Não modifica dados. |
| `04-rollback.sql` | Desfaz a migração (deleta apenas rows registradas em `id_map`). Não toca dados nativos. |
| `run-and-test.mjs` | Driver: aplica staging → injeta mock data sintético (tag `MIGTEST`) → roda transform → valida → rollback. Verifica que counts retornam ao valor pré-migração. |

## Como popular `_migration.v1_*`

Três caminhos:

### Opção A — pg_dump direto (recomendado)
```bash
# No v1 (com DATABASE_URL Postgres do Supabase):
pg_dump "$V1_DATABASE_URL" \
  --schema=public \
  --data-only \
  --table='laia_*' \
  --table='companies' --table='branches' --table='profiles' \
  --column-inserts \
  > v1-laia-dump.sql

# Edita o dump pra prefixar tabelas com _migration.v1_ (sed):
sed -i 's/public\.laia_/\_migration\.v1_laia_/g; s/public\.companies/\_migration\.v1_companies/g; s/public\.branches/\_migration\.v1_branches/g; s/public\.profiles/\_migration\.v1_profiles/g' v1-laia-dump.sql

# Aplica em v2:
psql "$V2_DATABASE_URL" < v1-laia-dump.sql
```

### Opção B — MCP Supabase (no workspace v1)
No workspace `/home/jp/daton/daton-esg-insight/` (que tem MCP configurado):
```
Use Supabase MCP to SELECT * from each table, então INSERT em _migration.v1_*
```

### Opção C — Supabase Studio (manual)
1. Abre o projeto no Supabase Studio
2. Em cada tabela, exporta CSV
3. `\copy _migration.v1_laia_assessments FROM 'laia_assessments.csv' WITH CSV HEADER` etc.

## Como rodar a migração

```bash
# 1. Config — ajusta org_id e fallback user
psql "$DATABASE_URL" -c "
  UPDATE _migration.config SET value='3' WHERE key='default_organization_id';
  UPDATE _migration.config SET value='53' WHERE key='fallback_user_id';
"

# 2. Transform (transacional)
psql "$DATABASE_URL" < 02-transform.sql

# 3. Validar
psql "$DATABASE_URL" < 03-validate.sql

# 4. Rollback se algo der errado
psql "$DATABASE_URL" < 04-rollback.sql
```

Ou com o driver Node (também faz mock-test antes):
```bash
node --env-file=/home/jp/daton/Daton/.env scripts/migration-v1-to-v2/run-and-test.mjs
```

## Decisões de mapeamento

### Enums
| Campo | v1 | v2 |
|---|---|---|
| `assessments.status` | `ativo` | `active` |
| `assessments.status` | `inativo` | `archived` |
| `assessments.status` | `em_revisao` | `draft` |
| `assessments.significance` | `significativo` | `significant` |
| `assessments.significance` | `nao_significativo` | `not_significant` |
| `revisions.status` | `finalizada` / `validada` | `finalized` |
| `revisions.status` | (outros) | `draft` |

### Bools derivados
| v2 | derivado de v1 |
|---|---|
| `control_level` | `has_lifecycle_control=true` → `direct_control`, senão `none` |
| `normal_condition` | `operational_situation = 'normal'` |
| `abnormal_condition` | `operational_situation = 'anormal'` |
| `startup_shutdown` | `false` (v1 não rastreia) |
| `emergency_scenario` | preenchido se `operational_situation = 'emergencia'` |
| `mode` | `'complete'` (v1 sempre completa) |

### Soft-delete
v1 marca via `deleted_at IS NOT NULL`. v2 usa `status='archived' + archived_at`. A migração:
- Copia `deleted_at` → `archived_at`
- Deixa `purged_at = NULL` (não auto-purgar dado migrado — quem decide é o usuário)
- Configurável: em `_migration.config` setar `handle_soft_deleted` para `'skip'` se preferir não migrar deletados.

### `output_actions` (v1 sem destino v2)
v2 não tem campo equivalente. Default: concatena em `notes` com prefixo `[saídas migradas do v1]:`. Configurável via `output_actions_destination = 'discard'`.

### legislation_references → laia_requirement_links
- JSONB array no v1 → N rows com `type='legal'`
- `legislation_reference` singular legado → 1 row com `type='other'`

### Usuários
- v1 usa Supabase auth UUIDs em `responsible_user_id`, `created_by`, `validated_by`, `changed_by`
- v2 usa `users.id` int
- Lookup: **email-match** (case-insensitive) entre `_migration.v1_profiles.email` e `public.users.email`
- Fallback se não match: `_migration.config.fallback_user_id` (default 53 = joaopedrobatista010@gmail.com)
- Profiles sem match registram em `_migration.skipped` (auditoria)

### Organizations / Units
- v1 `companies.id` UUID → v2 `organizations.id` int via `_migration.config.default_organization_id`
- v1 `branches` → v2 `units` via match por `code` (primeira tentativa) ou `name` (fallback)
- Branches sem match: skipped + assessments dependentes mantidas com `unit_id=NULL`

### Tabelas v2 sem origem v1
- `laia_methodologies` / `laia_methodology_versions` — **NÃO migra**. Cliente escolhe pós-import.
- `laia_monitoring_plans` / `_records` — **NÃO migra** (v1 não tinha).
- `laia_compliance_items` — **auto-criado** pelo backend na primeira `GET /compliance` (6 cláusulas em `nao_atendido`).
- `laia_ods_alignments` — **vazio** (v1 não tinha).
- `laia_import_jobs` — **vazio**.

## Garantias

- **Atomicidade**: `02-transform.sql` está envolvido em `BEGIN/COMMIT`. Se qualquer step falhar, nada é commitado.
- **Idempotência**: Pode rodar várias vezes. Detecta já-migrados via `_migration.id_map`. ON CONFLICT em chaves únicas.
- **Auditoria**: Toda row migrada tem entrada em `id_map`. Rows não migradas têm motivo em `skipped`.
- **Rollback**: `04-rollback.sql` deleta exatamente o que foi inserido, sem tocar dados nativos.

## Status atual

- ✅ Schema staging aplicado em prod (zero dados)
- ✅ Mapeamento documentado e validado contra schema v1 (5 migration files + types.ts)
- ✅ Transform script idempotente + transacional
- ✅ Validation queries + rollback
- ✅ Driver de teste end-to-end com mock data sintético
- ⏳ **Aguardando**: dump v1 ou liberação pra rodar `run-and-test.mjs` em prod
- ⏳ **Aguardando**: decisão sobre `output_actions` (default está em "notes_with_prefix")

## Próximo passo

Você decide:
1. Dispara o dump do v1 (preferencialmente `pg_dump --data-only --table='public.laia_*' --table=companies --table=branches --table=profiles`) e me passa o arquivo. Eu importo + rodo o transform.
2. Ou autoriza o `run-and-test.mjs` pra eu validar o pipeline com mock sintético em prod (rolls back ao final, contagens voltam ao pré-estado).
3. Ou abre o workspace `/home/jp/daton/daton-esg-insight` num Claude separado e usa o MCP do Supabase pra rodar o transform de lá.
