-- The filing watcher and investigation discussion threads.
-- NOT APPLIED: run it in the Supabase SQL editor (safe to run twice). Nothing breaks before it is run: the digest simply
-- shows no filings or comments, and the discussion panel reports that it is not set up yet.
--   sentinel_filings        results / annual-report announcements found on BSE for a covered company, one row each.
--   sentinel_review_links   a revocable, expiring link an analyst sends a colleague or client so they can read ONE
--                           investigation and comment on it without an account. Only a SHA-256 of the token is stored.
--   sentinel_comments       the thread on an investigation: the owner's comments and the reviewers' comments.
-- All three are read and written only through the app's server routes (service role); no policy is added, so with
-- row-level security on they are closed to direct browser access.

create table if not exists sentinel_filings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references sentinel_workspaces(id) on delete cascade,
  source text not null default 'bse',
  external_id text not null,
  kind text not null check (kind in ('results', 'annual_report')),
  headline text not null,
  filed_at text not null,
  url text,
  status text not null default 'new' check (status in ('new', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (workspace_id, source, external_id)
);
create index if not exists sentinel_filings_workspace_idx on sentinel_filings (workspace_id, status);

create table if not exists sentinel_review_links (
  id uuid primary key default gen_random_uuid(),
  investigation_id uuid not null references sentinel_investigations(id) on delete cascade,
  workspace_id uuid not null references sentinel_workspaces(id) on delete cascade,
  owner_id uuid not null,
  token_hash text not null unique,
  reviewer_label text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists sentinel_review_links_investigation_idx on sentinel_review_links (investigation_id);

create table if not exists sentinel_comments (
  id uuid primary key default gen_random_uuid(),
  investigation_id uuid not null references sentinel_investigations(id) on delete cascade,
  workspace_id uuid not null references sentinel_workspaces(id) on delete cascade,
  author_kind text not null check (author_kind in ('owner', 'reviewer')),
  author_label text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists sentinel_comments_investigation_idx on sentinel_comments (investigation_id, created_at);

alter table sentinel_filings enable row level security;
alter table sentinel_review_links enable row level security;
alter table sentinel_comments enable row level security;
