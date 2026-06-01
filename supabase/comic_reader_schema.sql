-- Production schema for the comic reader.
-- Apply this to a dedicated Supabase project before wiring the app to Postgres.

create extension if not exists pgcrypto;

create table if not exists public.series (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  aliases text[] not null default '{}',
  cover_url text,
  description text not null default '',
  status text not null default 'draft' check (status in ('draft', 'public', 'hidden')),
  source_mappings jsonb not null default '[]'::jsonb,
  stats jsonb not null default '{"views":0,"follows":0,"readDepth":0,"adViews":0}'::jsonb,
  imported_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.chapters (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series(id) on delete cascade,
  source_id text,
  slug text not null,
  title text not null,
  label text not null,
  source_url text,
  source_order integer not null default 0,
  status text not null default 'draft' check (status in ('draft', 'public', 'hidden')),
  imported boolean not null default false,
  page_count integer not null default 0,
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (series_id, slug),
  unique (series_id, source_id)
);

create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  page_order integer not null,
  image_url text not null,
  storage_key text,
  source_url text,
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  unique (chapter_id, page_order)
);

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  aliases text[] not null default '{}'
);

create table if not exists public.series_tags (
  series_id uuid not null references public.series(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (series_id, tag_id)
);

create table if not exists public.crawl_jobs (
  id uuid primary key default gen_random_uuid(),
  source_url text not null,
  adapter text,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  payload jsonb not null default '{}'::jsonb,
  progress jsonb not null default '{}'::jsonb,
  error text,
  series_id uuid references public.series(id) on delete set null,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crawl_job_logs (
  id bigserial primary key,
  job_id uuid not null references public.crawl_jobs(id) on delete cascade,
  phase text,
  message text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.analytics_events (
  id bigserial primary key,
  event_type text not null,
  series_id uuid references public.series(id) on delete set null,
  chapter_id uuid references public.chapters(id) on delete set null,
  value numeric,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_series_status_updated on public.series(status, updated_at desc);
create index if not exists idx_series_stats_gin on public.series using gin (stats);
create index if not exists idx_chapters_series_order on public.chapters(series_id, source_order);
create index if not exists idx_chapters_series_status on public.chapters(series_id, status);
create index if not exists idx_pages_chapter_order on public.pages(chapter_id, page_order);
create index if not exists idx_crawl_jobs_status_created on public.crawl_jobs(status, created_at desc);
create index if not exists idx_crawl_jobs_source_running on public.crawl_jobs(source_url, status)
  where status in ('queued', 'running');
create index if not exists idx_analytics_events_series_created on public.analytics_events(series_id, created_at desc);

alter table public.series enable row level security;
alter table public.chapters enable row level security;
alter table public.pages enable row level security;
alter table public.tags enable row level security;
alter table public.series_tags enable row level security;
alter table public.crawl_jobs enable row level security;
alter table public.crawl_job_logs enable row level security;
alter table public.analytics_events enable row level security;

drop policy if exists "public read public series" on public.series;
create policy "public read public series"
  on public.series for select
  using (status = 'public');

drop policy if exists "public read public chapters" on public.chapters;
create policy "public read public chapters"
  on public.chapters for select
  using (
    status = 'public'
    and exists (
      select 1 from public.series
      where series.id = chapters.series_id
        and series.status = 'public'
    )
  );

drop policy if exists "public read public pages" on public.pages;
create policy "public read public pages"
  on public.pages for select
  using (
    exists (
      select 1
      from public.chapters
      join public.series on series.id = chapters.series_id
      where chapters.id = pages.chapter_id
        and chapters.status = 'public'
        and series.status = 'public'
    )
  );

drop policy if exists "public read tags" on public.tags;
create policy "public read tags"
  on public.tags for select
  using (true);

drop policy if exists "public read series tags" on public.series_tags;
create policy "public read series tags"
  on public.series_tags for select
  using (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comic-pages',
  'comic-pages',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public read comic pages" on storage.objects;
create policy "public read comic pages"
  on storage.objects for select
  using (bucket_id = 'comic-pages');
