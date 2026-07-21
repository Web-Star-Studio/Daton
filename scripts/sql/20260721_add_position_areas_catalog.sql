-- Catálogo de áreas (setores) de cargo, por organização (substitui a lista fixa
-- que ficava hardcoded no formulário de cargo). Cargos referenciam por id
-- (`positions.area_id`). Espelha `regulatory_norms` / `effectiveness_methods`.
--
-- Idempotente: pode rodar mais de uma vez sem efeito colateral. A tabela e a
-- coluna também nascem via `drizzle-kit push`; este arquivo garante a mesma
-- estrutura + a FK (ON DELETE SET NULL, para preservar cargos ao desativar/
-- remover uma área) de forma auto-contida para o apply cirúrgico em produção.
--
-- BACKFILL (dados) é separado: scripts/src/migrate/areas-backfill.ts
-- (dry-run por padrão; --commit para aplicar).

CREATE TABLE IF NOT EXISTS areas (
  id              serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  label           text NOT NULL,
  active          boolean NOT NULL DEFAULT true,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Unicidade case-insensitive por organização (impede "Manutenção" x "manutenção").
CREATE UNIQUE INDEX IF NOT EXISTS area_org_lower_label_unique
  ON areas (organization_id, lower(label));

-- Referência do cargo à área.
ALTER TABLE positions ADD COLUMN IF NOT EXISTS area_id integer;

-- FK ON DELETE SET NULL (sem ADD CONSTRAINT IF NOT EXISTS no Postgres → guard).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'positions_area_id_areas_id_fk'
  ) THEN
    ALTER TABLE positions
      ADD CONSTRAINT positions_area_id_areas_id_fk
      FOREIGN KEY (area_id) REFERENCES areas (id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS positions_area_id_idx ON positions (area_id);
