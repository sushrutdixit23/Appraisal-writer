-- What the auditor's report says about the audit (opinion, emphasis of matter, going concern) and the contingent-liability sentences found in an annual report,
-- saved with the audited year's statement. NOT APPLIED: run it in the Supabase SQL editor (safe to run twice). Nothing breaks before it is run: the checks are
-- shown in the import preview but not saved, and everything else saves as before.
alter table sentinel_statements add column if not exists annual_report_checks text;
