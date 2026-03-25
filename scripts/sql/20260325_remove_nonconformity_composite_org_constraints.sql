ALTER TABLE nonconformities DROP CONSTRAINT IF EXISTS nonconformities_responsible_user_org_fk;
ALTER TABLE nonconformities DROP CONSTRAINT IF EXISTS nonconformities_process_org_fk;
ALTER TABLE nonconformities DROP CONSTRAINT IF EXISTS nonconformities_document_org_fk;
ALTER TABLE nonconformities DROP CONSTRAINT IF EXISTS nonconformities_risk_item_org_fk;
ALTER TABLE nonconformities DROP CONSTRAINT IF EXISTS nonconformities_audit_finding_org_fk;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_org_id_unique;
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_org_id_unique;
ALTER TABLE sgq_processes DROP CONSTRAINT IF EXISTS sgq_processes_org_id_unique;
ALTER TABLE internal_audit_findings DROP CONSTRAINT IF EXISTS internal_audit_findings_org_id_unique;
ALTER TABLE strategic_plan_risk_opportunity_items
  DROP CONSTRAINT IF EXISTS strategic_plan_risk_opportunity_items_org_id_unique;
