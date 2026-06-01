alter table if exists crawl_jobs add column if not exists payload jsonb not null default '{}'::jsonb;
alter table if exists crawl_jobs add column if not exists result jsonb not null default '{}'::jsonb;
alter table if exists crawl_jobs add column if not exists series_id text;
alter table if exists crawl_jobs add column if not exists reason text;
alter table if exists crawl_jobs add column if not exists priority integer not null default 0;
alter table if exists crawl_jobs add column if not exists attempts integer not null default 0;
alter table if exists crawl_jobs add column if not exists max_attempts integer not null default 3;
alter table if exists crawl_jobs add column if not exists run_after timestamptz not null default now();
alter table if exists crawl_jobs add column if not exists locked_by text;
alter table if exists crawl_jobs add column if not exists locked_at timestamptz;
alter table if exists crawl_jobs add column if not exists last_error text;

create index if not exists idx_crawl_jobs_queue
  on crawl_jobs(status, run_after, priority desc, created_at);
