-- AuditLog is append-only at the database layer (INSERT allowed; UPDATE/DELETE blocked).
-- Application code must not rely on mutating or deleting audit rows.
-- Legal purge requires DBA export-then-break-glass:
--   1) export matching rows,
--   2) DROP TRIGGER(s) / function as needed,
--   3) delete under dual control,
--   4) restore this migration's triggers.

CREATE OR REPLACE FUNCTION forbid_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'AuditLog is append-only: UPDATE and DELETE are forbidden. Legal purge requires DBA export-then-break-glass.'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

DROP TRIGGER IF EXISTS audit_log_forbid_update ON "AuditLog";
CREATE TRIGGER audit_log_forbid_update
  BEFORE UPDATE ON "AuditLog"
  FOR EACH ROW
  EXECUTE FUNCTION forbid_audit_log_mutation();

DROP TRIGGER IF EXISTS audit_log_forbid_delete ON "AuditLog";
CREATE TRIGGER audit_log_forbid_delete
  BEFORE DELETE ON "AuditLog"
  FOR EACH ROW
  EXECUTE FUNCTION forbid_audit_log_mutation();
