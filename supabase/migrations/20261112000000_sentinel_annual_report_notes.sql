-- What the notes to an annual report say: receivables ageing, the auditor's CARO answers, the ratios the company discloses, contingent liabilities, when borrowings
-- fall due, and related-party transactions - each finding with its page. Stored with the audited year as JSON text (written by autofill/notes serialiseNotes).
-- NOT APPLIED: run it in the Supabase SQL editor (safe to run twice). Nothing breaks before it is run: a statement save that fails on the missing column is retried
-- without it, so the figures still save and the notes are simply not kept.

alter table sentinel_statements add column if not exists annual_report_notes text;
