-- WEB-48
-- Add normative requirements to SGQ documents without touching existing
-- composite unique constraints or foreign keys.
--
-- This migration is idempotent and safe to rerun.

-- 1. Create the column if it does not exist yet.
ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS normative_requirements text[];

-- 2. Backfill existing rows before enforcing NOT NULL.
UPDATE public.documents
SET normative_requirements = '{}'::text[]
WHERE normative_requirements IS NULL;

-- 3. Enforce the desired default for new rows.
ALTER TABLE public.documents
ALTER COLUMN normative_requirements SET DEFAULT '{}'::text[];

-- 4. Enforce the final shape expected by the application.
ALTER TABLE public.documents
ALTER COLUMN normative_requirements SET NOT NULL;

-- Verification
-- SELECT column_name, data_type, udt_name, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'documents'
--   AND column_name = 'normative_requirements';
