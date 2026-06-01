create table if not exists series (
  id text primary key,
  title text not null,
  slug text not null,
  aliases jsonb not null default '[]'::jsonb,
  cover_url text,
  description text,
  status text not null default 'draft',
  source_mappings jsonb not null default '[]'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  stats jsonb not null default '{}'::jsonb,
  crawl_schedule jsonb not null default '{"enabled":false,"intervalHours":24}'::jsonb,
  source_url text,
  adapter text,
  imported_at timestamptz,
  updated_at timestamptz
);

create table if not exists chapters (
  series_id text not null references series(id) on delete cascade,
  id text not null,
  title text,
  label text,
  slug text not null,
  status text not null default 'draft',
  source_url text,
  source_order integer,
  page_count integer not null default 0,
  imported boolean not null default false,
  published_at timestamptz,
  updated_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  primary key (series_id, id),
  unique (series_id, slug)
);

create table if not exists pages (
  id bigserial primary key,
  series_id text not null,
  chapter_id text not null,
  page_order integer not null,
  image_url text not null,
  storage_key text,
  source_url text,
  width integer,
  height integer,
  raw jsonb not null default '{}'::jsonb,
  unique (series_id, chapter_id, page_order),
  foreign key (series_id, chapter_id) references chapters(series_id, id) on delete cascade
);

create table if not exists tags (
  slug text primary key,
  name text not null
);

create table if not exists series_tags (
  series_id text not null references series(id) on delete cascade,
  tag_slug text not null references tags(slug) on delete cascade,
  primary key (series_id, tag_slug)
);

create table if not exists crawl_jobs (
  id text primary key,
  source_url text not null,
  adapter text,
  status text not null default 'queued',
  payload jsonb not null default '{}'::jsonb,
  progress jsonb not null default '{}'::jsonb,
  logs jsonb not null default '[]'::jsonb,
  result jsonb not null default '{}'::jsonb,
  series_id text,
  reason text,
  priority integer not null default 0,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  run_after timestamptz not null default now(),
  locked_by text,
  locked_at timestamptz,
  last_error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_series_slug on series(slug);
create index if not exists idx_series_status_updated on series(status, updated_at desc);
create index if not exists idx_chapters_series_slug on chapters(series_id, slug);
create index if not exists idx_chapters_series_order on chapters(series_id, source_order);
create index if not exists idx_pages_chapter_order on pages(series_id, chapter_id, page_order);
create index if not exists idx_series_tags_tag on series_tags(tag_slug, series_id);
create index if not exists idx_crawl_jobs_source_status on crawl_jobs(source_url, status);
create index if not exists idx_crawl_jobs_queue on crawl_jobs(status, run_after, priority desc, created_at);
