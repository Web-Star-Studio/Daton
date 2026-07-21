-- Departamento do cargo: referência de `positions` ao módulo Organização →
-- Departamentos (`departments`). Substitui o conceito de "Área"/catálogo `areas`
-- (que fica dormente até o backfill area→departamento).
--
-- Idempotente: pode rodar mais de uma vez sem efeito colateral. `departments` já
-- existe; aqui só adicionamos a coluna + FK (ON DELETE SET NULL, para preservar
-- o cargo ao excluir um departamento) e um índice.

ALTER TABLE positions ADD COLUMN IF NOT EXISTS department_id integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'positions_department_id_departments_id_fk'
  ) THEN
    ALTER TABLE positions
      ADD CONSTRAINT positions_department_id_departments_id_fk
      FOREIGN KEY (department_id) REFERENCES departments (id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS positions_department_id_idx ON positions (department_id);
