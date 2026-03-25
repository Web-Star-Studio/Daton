BEGIN;

CREATE TABLE IF NOT EXISTS document_recipient_user_links (
  id serial PRIMARY KEY,
  document_id integer NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_recipient_user_links_document_user_unique
    UNIQUE (document_id, user_id)
);

CREATE TABLE IF NOT EXISTS organization_contacts (
  id serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_user_id integer REFERENCES users(id),
  source_employee_id integer REFERENCES employees(id),
  name text NOT NULL,
  email text,
  phone text,
  organization_name text,
  classification_type text NOT NULL DEFAULT 'other',
  classification_description text,
  notes text,
  created_by_id integer NOT NULL REFERENCES users(id),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_contacts_org_source_user_unique
    UNIQUE (organization_id, source_user_id),
  CONSTRAINT organization_contacts_org_source_employee_unique
    UNIQUE (organization_id, source_employee_id)
);

CREATE TABLE IF NOT EXISTS organization_contact_groups (
  id serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_by_id integer NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_contact_group_members (
  id serial PRIMARY KEY,
  group_id integer NOT NULL REFERENCES organization_contact_groups(id) ON DELETE CASCADE,
  contact_id integer NOT NULL REFERENCES organization_contacts(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_contact_group_members_group_contact_unique
    UNIQUE (group_id, contact_id)
);

INSERT INTO organization_contact_groups (
  id,
  organization_id,
  name,
  description,
  created_by_id,
  created_at,
  updated_at
)
SELECT
  legacy_group.id,
  legacy_group.organization_id,
  legacy_group.name,
  legacy_group.description,
  legacy_group.created_by_id,
  legacy_group.created_at,
  legacy_group.updated_at
FROM document_recipient_groups AS legacy_group
ON CONFLICT (id) DO NOTHING;

INSERT INTO organization_contacts (
  organization_id,
  source_type,
  source_user_id,
  source_employee_id,
  name,
  email,
  phone,
  organization_name,
  classification_type,
  classification_description,
  notes,
  created_by_id,
  created_at,
  updated_at
)
SELECT DISTINCT
  legacy_group.organization_id,
  'system_user',
  member.user_id,
  NULL,
  linked_user.name,
  linked_user.email,
  NULL,
  NULL,
  'other',
  NULL,
  NULL,
  legacy_group.created_by_id,
  COALESCE(member.created_at, legacy_group.created_at, now()),
  COALESCE(member.created_at, legacy_group.updated_at, now())
FROM document_recipient_group_members AS member
INNER JOIN document_recipient_groups AS legacy_group
  ON legacy_group.id = member.group_id
INNER JOIN users AS linked_user
  ON linked_user.id = member.user_id
LEFT JOIN organization_contacts AS existing_contact
  ON existing_contact.organization_id = legacy_group.organization_id
 AND existing_contact.source_user_id = member.user_id
WHERE existing_contact.id IS NULL;

INSERT INTO organization_contact_group_members (
  group_id,
  contact_id,
  created_at
)
SELECT DISTINCT
  member.group_id,
  contact.id,
  COALESCE(member.created_at, now())
FROM document_recipient_group_members AS member
INNER JOIN document_recipient_groups AS legacy_group
  ON legacy_group.id = member.group_id
INNER JOIN organization_contacts AS contact
  ON contact.organization_id = legacy_group.organization_id
 AND contact.source_user_id = member.user_id
LEFT JOIN organization_contact_group_members AS existing_member
  ON existing_member.group_id = member.group_id
 AND existing_member.contact_id = contact.id
WHERE existing_member.id IS NULL;

CREATE TABLE IF NOT EXISTS document_recipient_group_links (
  id serial PRIMARY KEY,
  document_id integer NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  group_id integer NOT NULL REFERENCES organization_contact_groups(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_recipient_group_links_document_group_unique
    UNIQUE (document_id, group_id)
);

DO $$
DECLARE
  legacy_fk_name text;
BEGIN
  SELECT con.conname
    INTO legacy_fk_name
  FROM pg_constraint AS con
  INNER JOIN pg_class AS rel
    ON rel.oid = con.conrelid
  WHERE rel.relname = 'document_recipient_group_links'
    AND con.contype = 'f'
    AND pg_get_constraintdef(con.oid) ILIKE '%(group_id)%REFERENCES document_recipient_groups%';

  IF legacy_fk_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE document_recipient_group_links DROP CONSTRAINT %I',
      legacy_fk_name
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS con
    INNER JOIN pg_class AS rel
      ON rel.oid = con.conrelid
    WHERE rel.relname = 'document_recipient_group_links'
      AND con.conname = 'document_recipient_group_links_group_id_fkey'
  ) THEN
    ALTER TABLE document_recipient_group_links
      ADD CONSTRAINT document_recipient_group_links_group_id_fkey
      FOREIGN KEY (group_id)
      REFERENCES organization_contact_groups(id);
  END IF;
END $$;

SELECT setval(
  pg_get_serial_sequence('organization_contacts', 'id'),
  COALESCE((SELECT MAX(id) FROM organization_contacts), 1),
  (SELECT COUNT(*) > 0 FROM organization_contacts)
);

SELECT setval(
  pg_get_serial_sequence('organization_contact_groups', 'id'),
  COALESCE((SELECT MAX(id) FROM organization_contact_groups), 1),
  (SELECT COUNT(*) > 0 FROM organization_contact_groups)
);

SELECT setval(
  pg_get_serial_sequence('organization_contact_group_members', 'id'),
  COALESCE((SELECT MAX(id) FROM organization_contact_group_members), 1),
  (SELECT COUNT(*) > 0 FROM organization_contact_group_members)
);

SELECT setval(
  pg_get_serial_sequence('document_recipient_group_links', 'id'),
  COALESCE((SELECT MAX(id) FROM document_recipient_group_links), 1),
  (SELECT COUNT(*) > 0 FROM document_recipient_group_links)
);

SELECT setval(
  pg_get_serial_sequence('document_recipient_user_links', 'id'),
  COALESCE((SELECT MAX(id) FROM document_recipient_user_links), 1),
  (SELECT COUNT(*) > 0 FROM document_recipient_user_links)
);

COMMIT;
