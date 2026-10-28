-- One optional statement column: the auditor's own Key Audit Matters paragraph(s), verbatim.
-- NOT APPLIED: run it in the Supabase SQL editor (safe to run twice). The app works before and
-- after: it only sends this column when it holds a value.
--   key_audit_matters_text  captured at extraction time (extractKeyAuditMattersText in
--                           extraction.ts) from the pages findKeyAuditMattersPages locates - never
--                           read into a numeric field, but fed to the investigation narrative
--                           prompt so a hypothesis can cite the auditor's real wording instead of
--                           ratios alone.

alter table sentinel_statements add column if not exists key_audit_matters_text text;
