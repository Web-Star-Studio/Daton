-- Diagnóstico do Fator de Desempenho (ISO 39001 §6.3): periodicidade + histórico.
-- Idempotente: pode rodar duas vezes sem efeito colateral.

ALTER TABLE road_safety_factors
  ADD COLUMN IF NOT EXISTS diagnosis_periodicity varchar(20);

CREATE TABLE IF NOT EXISTS road_safety_factor_diagnoses (
  id serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  factor_id integer NOT NULL REFERENCES road_safety_factors(id) ON DELETE CASCADE,
  content text NOT NULL,
  reference_date date NOT NULL,
  diagnosed_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS road_safety_diagnoses_factor_idx
  ON road_safety_factor_diagnoses (factor_id, reference_date);
