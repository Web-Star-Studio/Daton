-- Turma abrangendo múltiplas filiais, com responsável por filial.
--
-- Antes: training_classes.unit_id (uma filial por turma).
-- Depois: training_class_units (N filiais por turma) + responsible_user_id em
-- cada vínculo. A coluna training_classes.unit_id permanece como ESPELHO da
-- primeira filial vinculada (legado / consumidores SQL antigos) — a aplicação
-- escreve as duas coisas na mesma transação.
--
-- Idempotente: seguro rodar novamente.

BEGIN;

CREATE TABLE IF NOT EXISTS public.training_class_units (
  id serial PRIMARY KEY,
  class_id integer NOT NULL REFERENCES public.training_classes(id) ON DELETE CASCADE,
  unit_id integer NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  responsible_user_id integer REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS training_class_unit_uq
  ON public.training_class_units (class_id, unit_id);

CREATE INDEX IF NOT EXISTS training_class_units_unit_idx
  ON public.training_class_units (unit_id);

-- Backfill: cada turma que já tinha filial vira um vínculo (sem responsável).
INSERT INTO public.training_class_units (class_id, unit_id)
SELECT c.id, c.unit_id
FROM public.training_classes c
WHERE c.unit_id IS NOT NULL
ON CONFLICT (class_id, unit_id) DO NOTHING;

COMMIT;

-- Verificação
-- SELECT
--   (SELECT count(*) FROM training_classes WHERE unit_id IS NOT NULL) AS turmas_com_filial,
--   (SELECT count(DISTINCT class_id) FROM training_class_units)       AS turmas_vinculadas;
-- Os dois números devem bater logo após o backfill.
