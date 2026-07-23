-- Responsável pela TURMA (nível turma, não por filial).
--
-- Decisão da cliente (2026-07-23): quando o treinamento envolve várias filiais
-- é online, com UM instrutor e UM responsável pela turma inteira. Substitui o
-- responsável por filial (training_class_units.responsible_user_id), que fica
-- dormente (não é dropado, para reversibilidade).
--
-- Aditiva e idempotente: o backend antigo ignora a coluna nova.

BEGIN;

ALTER TABLE public.training_classes
  ADD COLUMN IF NOT EXISTS responsible_user_id integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'training_classes_responsible_user_id_users_id_fk'
  ) THEN
    ALTER TABLE public.training_classes
      ADD CONSTRAINT training_classes_responsible_user_id_users_id_fk
      FOREIGN KEY (responsible_user_id) REFERENCES public.users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

COMMIT;

-- Verificação
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='training_classes'
--   AND column_name='responsible_user_id';
