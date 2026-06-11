import { mergeSeries } from './catalogMerge.mjs';
import { normalizeAssetMode } from './importOptions.mjs';
import { catalogStorageMode, requirePostgresCatalogUrl } from './storageConfig.mjs';
import { slugify } from './utils.mjs';

let poolPromise = null;
let poolUrl = '';
let schemaPromise = null;

export const POSTGRES_SCHEMA_SQL = `
create table if not exists series (
  id text primary key,
  title text not null,
  slug text not null,
  aliases jsonb not null default '[]'::jsonb,
  cover_url text,
  thumbnail_url text,
  cover_thumbnail jsonb,
  description text,
  status text not null default 'draft',
  source_mappings jsonb not null default '[]'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  stats jsonb not null default '{}'::jsonb,
  crawl_schedule jsonb not null default '{"enabled":false,"intervalHours":24}'::jsonb,
  source_url text,
  adapter text,
  imported_at timestamptz,
  import_mode text not null default 'image_url',
  asset_status text not null default 'external',
  image_error_count integer not null default 0,
  last_asset_check_at timestamptz,
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
  import_mode text not null default 'image_url',
  asset_status text not null default 'external',
  image_error_count integer not null default 0,
  last_asset_check_at timestamptz,
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
  asset_status text not null default 'external',
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

create table if not exists app_users (
  id text primary key,
  identifier text not null unique,
  display_name text not null,
  password_hash text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists app_sessions (
  token_hash text primary key,
  user_id text not null references app_users(id) on delete cascade,
  created_at timestamptz not null,
  expires_at timestamptz not null
);

create table if not exists bulletin_messages (
  id text primary key,
  text text not null,
  author_role text not null,
  author_id text not null,
  author_name text not null,
  pinned boolean not null default false,
  pinned_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists analytics_events (
  id bigserial primary key,
  type text not null,
  series_slug text,
  chapter_slug text,
  value numeric,
  placement text,
  source text,
  url text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

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
alter table if exists series add column if not exists thumbnail_url text;
alter table if exists series add column if not exists cover_thumbnail jsonb;
alter table if exists series add column if not exists import_mode text not null default 'image_url';
alter table if exists series add column if not exists asset_status text not null default 'external';
alter table if exists series add column if not exists image_error_count integer not null default 0;
alter table if exists series add column if not exists last_asset_check_at timestamptz;
alter table if exists chapters add column if not exists import_mode text not null default 'image_url';
alter table if exists chapters add column if not exists asset_status text not null default 'external';
alter table if exists chapters add column if not exists image_error_count integer not null default 0;
alter table if exists chapters add column if not exists last_asset_check_at timestamptz;
alter table if exists pages add column if not exists asset_status text not null default 'external';

update pages
set asset_status = 'local'
where asset_status = 'external'
  and coalesce(storage_key, '') <> '';

update chapters c
set import_mode = 'full_download',
    asset_status = 'local'
where exists (
  select 1
  from pages p
  where p.series_id = c.series_id
    and p.chapter_id = c.id
    and coalesce(p.storage_key, '') <> ''
);

update series s
set import_mode = 'full_download',
    asset_status = 'local'
where exists (
  select 1
  from chapters c
  where c.series_id = s.id
    and c.asset_status = 'local'
);

create index if not exists idx_series_slug on series(slug);
create index if not exists idx_series_status_updated on series(status, updated_at desc);
create index if not exists idx_chapters_series_slug on chapters(series_id, slug);
create index if not exists idx_chapters_series_order on chapters(series_id, source_order);
create index if not exists idx_pages_chapter_order on pages(series_id, chapter_id, page_order);
create index if not exists idx_series_tags_tag on series_tags(tag_slug, series_id);
create index if not exists idx_crawl_jobs_source_status on crawl_jobs(source_url, status);
create index if not exists idx_crawl_jobs_queue on crawl_jobs(status, run_after, priority desc, created_at);
create index if not exists idx_app_sessions_user_id on app_sessions(user_id);
create index if not exists idx_app_sessions_expires_at on app_sessions(expires_at);
create index if not exists idx_bulletin_messages_pinned on bulletin_messages(pinned, pinned_at);
create index if not exists idx_bulletin_messages_created_at on bulletin_messages(created_at);
create index if not exists idx_analytics_events_created_at on analytics_events(created_at desc);
create index if not exists idx_analytics_events_type on analytics_events(type, created_at desc);
`;

export function usesPostgresStorage() {
  return catalogStorageMode() === 'postgres';
}

export async function ensurePostgresSchema() {
  if (!usesPostgresStorage()) return false;
  if (process.env.POSTGRES_SKIP_SCHEMA_INIT === 'true') return true;
  if (!schemaPromise) {
    schemaPromise = queryPostgres(POSTGRES_SCHEMA_SQL).then(() => true);
  }
  return schemaPromise;
}

export async function readCatalogFromPostgres({ includePages = true } = {}) {
  const client = await getPool();
  const [seriesResult, chaptersResult, tagsResult] = await Promise.all([
    client.query('select * from series order by updated_at desc nulls last, imported_at desc nulls last, title asc'),
    client.query('select * from chapters order by series_id, source_order nulls last, id'),
    client.query(`
      select st.series_id, t.slug, t.name
      from series_tags st
      join tags t on t.slug = st.tag_slug
      order by t.name asc
    `)
  ]);
  const pageRows = includePages
    ? (await client.query('select * from pages order by series_id, chapter_id, page_order')).rows
    : [];
  return catalogFromRows({
    seriesRows: seriesResult.rows,
    chapterRows: chaptersResult.rows,
    pageRows,
    tagRows: tagsResult.rows,
    includePages
  });
}

export async function getSeriesFromPostgres(idOrSlug, { includePages = true, includeDraft = true } = {}) {
  const target = String(idOrSlug || '').trim();
  if (!target) return null;
  const client = await getPool();
  const seriesResult = await client.query(
    `select * from series
     where (id = $1 or slug = $1)${includeDraft ? '' : " and status = 'public'"}
     order by updated_at desc nulls last
     limit 1`,
    [target]
  );
  if (!seriesResult.rows.length) return null;
  const seriesIds = seriesResult.rows.map((row) => row.id);
  const [chaptersResult, tagsResult] = await Promise.all([
    client.query('select * from chapters where series_id = any($1::text[]) order by series_id, source_order nulls last, id', [seriesIds]),
    client.query(`
      select st.series_id, t.slug, t.name
      from series_tags st
      join tags t on t.slug = st.tag_slug
      where st.series_id = any($1::text[])
      order by t.name asc
    `, [seriesIds])
  ]);
  const pageRows = includePages
    ? (await client.query('select * from pages where series_id = any($1::text[]) order by series_id, chapter_id, page_order', [seriesIds])).rows
    : [];
  return catalogFromRows({
    seriesRows: seriesResult.rows,
    chapterRows: chaptersResult.rows,
    pageRows,
    tagRows: tagsResult.rows,
    includePages
  }).series[0] || null;
}

export async function getChapterPagesFromPostgres(seriesId, chapterIds = []) {
  const ids = [...new Set((chapterIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!String(seriesId || '').trim() || !ids.length) return new Map();
  const client = await getPool();
  const rows = (await client.query(
    'select * from pages where series_id = $1 and chapter_id = any($2::text[]) order by chapter_id, page_order',
    [String(seriesId), ids]
  )).rows;
  const pagesByChapter = new Map();
  for (const row of rows) {
    const pages = pagesByChapter.get(row.chapter_id) || [];
    pages.push(pageFromRow(row));
    pagesByChapter.set(row.chapter_id, pages);
  }
  return pagesByChapter;
}

export async function upsertSeriesInPostgres(series) {
  await ensurePostgresSchema();
  const existing = await getSeriesFromPostgres(series.id, { includePages: true });
  const merged = mergeSeries(existing, series);
  const next = {
    ...merged,
    importedAt: merged.importedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await withPostgresTransaction((client) => upsertSeriesRows(client, next));
  return next;
}

export async function writeCatalogToPostgres(catalog) {
  await ensurePostgresSchema();
  await withPostgresTransaction(async (client) => {
    for (const series of catalog.series || []) {
      await upsertSeriesRows(client, series);
    }
  });
}

async function getPool() {
  const databaseUrl = requirePostgresCatalogUrl();
  if (poolPromise && poolUrl && poolUrl !== databaseUrl) {
    const pool = await poolPromise;
    await pool.end().catch(() => {});
    poolPromise = null;
    schemaPromise = null;
    poolUrl = '';
  }
  if (!poolPromise) {
    poolUrl = databaseUrl;
    poolPromise = import('pg').then((module) => {
      const Pool = module.Pool || module.default?.Pool;
      if (!Pool) throw new Error('The pg package is installed but did not expose Pool.');
      return new Pool({
        connectionString: databaseUrl,
        max: Number(process.env.POSTGRES_POOL_MAX || 10),
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
        ssl: postgresSslConfig(databaseUrl)
      });
    });
  }
  return poolPromise;
}

export async function queryPostgres(sql, params = []) {
  const pool = await getPool();
  return pool.query(sql, params);
}

export async function closePostgresPool() {
  if (!poolPromise) return;
  const pool = await poolPromise;
  poolPromise = null;
  poolUrl = '';
  schemaPromise = null;
  await pool.end().catch(() => {});
}

export async function withPostgresTransaction(work) {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function postgresSslConfig(databaseUrl = requirePostgresCatalogUrl()) {
  if (process.env.POSTGRES_SSL === 'false') return false;
  if (/localhost|127\.0\.0\.1|::1/i.test(databaseUrl)) return false;
  const ssl = { rejectUnauthorized: process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED !== 'false' };
  const ca = postgresSslCa();
  if (ca) ssl.ca = ca;
  try {
    ssl.servername = new URL(databaseUrl).hostname;
  } catch {
    // Keep pg defaults when the connection string is not URL-shaped.
  }
  return ssl;
}

function postgresSslCa() {
  const encoded = String(process.env.POSTGRES_SSL_CA_BASE64 || '').trim();
  if (encoded) return Buffer.from(encoded, 'base64').toString('utf8');
  const raw = String(process.env.POSTGRES_SSL_CA || '').trim();
  return raw ? raw.replace(/\\n/g, '\n') : '';
}

async function upsertSeriesRows(client, rawSeries) {
  const series = normalizeSeriesForStorage(rawSeries);
  await client.query(`
    insert into series (
      id, title, slug, aliases, cover_url, thumbnail_url, cover_thumbnail, description, status, source_mappings,
      tags, stats, crawl_schedule, source_url, adapter, imported_at, import_mode, asset_status,
      image_error_count, last_asset_check_at, updated_at
    ) values (
      $1, $2, $3, $4::jsonb, $5, $6, $7::jsonb, $8, $9, $10::jsonb,
      $11::jsonb, $12::jsonb, $13::jsonb, $14, $15, $16, $17, $18,
      $19, $20, $21
    )
    on conflict (id) do update set
      title = excluded.title,
      slug = excluded.slug,
      aliases = excluded.aliases,
      cover_url = excluded.cover_url,
      thumbnail_url = excluded.thumbnail_url,
      cover_thumbnail = excluded.cover_thumbnail,
      description = excluded.description,
      status = excluded.status,
      source_mappings = excluded.source_mappings,
      tags = excluded.tags,
      stats = excluded.stats,
      crawl_schedule = excluded.crawl_schedule,
      source_url = excluded.source_url,
      adapter = excluded.adapter,
      imported_at = coalesce(series.imported_at, excluded.imported_at),
      import_mode = excluded.import_mode,
      asset_status = excluded.asset_status,
      image_error_count = excluded.image_error_count,
      last_asset_check_at = excluded.last_asset_check_at,
      updated_at = excluded.updated_at
  `, [
    series.id,
    series.title,
    series.slug,
    json(series.aliases),
    series.coverUrl,
    series.thumbnailUrl,
    json(series.coverThumbnail),
    series.description,
    series.status,
    json(series.sourceMappings),
    json(series.tags),
    json(series.stats),
    json(series.crawlSchedule),
    series.sourceUrl,
    series.adapter,
    timestamp(series.importedAt),
    series.importMode,
    series.assetStatus,
    series.imageErrorCount,
    timestamp(series.lastAssetCheckAt),
    timestamp(series.updatedAt)
  ]);

  await client.query('delete from chapters where series_id = $1', [series.id]);
  await client.query('delete from series_tags where series_id = $1', [series.id]);

  for (const tag of series.tags) {
    await client.query(
      'insert into tags (slug, name) values ($1, $2) on conflict (slug) do update set name = excluded.name',
      [tag.slug, tag.name]
    );
    await client.query(
      'insert into series_tags (series_id, tag_slug) values ($1, $2) on conflict do nothing',
      [series.id, tag.slug]
    );
  }

  const usedChapterSlugs = new Set();
  for (const [chapterIndex, rawChapter] of series.chapters.entries()) {
    const chapter = normalizeChapterForStorage(rawChapter, chapterIndex);
    chapter.slug = makeUniqueChapterSlugForStorage(chapter.slug, chapter.id, chapterIndex, usedChapterSlugs);
    await client.query(`
      insert into chapters (
        series_id, id, title, label, slug, status, source_url, source_order,
        page_count, imported, import_mode, asset_status, image_error_count, last_asset_check_at,
        published_at, updated_at, raw
      ) values (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14,
        $15, $16, $17::jsonb
      )
    `, [
      series.id,
      chapter.id,
      chapter.title,
      chapter.label,
      chapter.slug,
      chapter.status,
      chapter.sourceUrl,
      chapter.sourceOrder,
      chapter.pageCount,
      chapter.imported,
      chapter.importMode,
      chapter.assetStatus,
      chapter.imageErrorCount,
      timestamp(chapter.lastAssetCheckAt),
      timestamp(chapter.publishedAt),
      timestamp(chapter.updatedAt),
      json(chapter.raw)
    ]);

    await insertChapterPages(client, series.id, chapter.id, chapter.pages);
  }
}

async function insertChapterPages(client, seriesId, chapterId, rawPages = []) {
  const pages = rawPages
    .map((rawPage, pageIndex) => normalizePageForStorage(rawPage, pageIndex))
    .filter((page) => page.imageUrl);
  const chunkSize = 500;
  for (let index = 0; index < pages.length; index += chunkSize) {
    const chunk = pages.slice(index, index + chunkSize);
    const values = [];
    const placeholders = chunk.map((page, chunkIndex) => {
      const offset = chunkIndex * 10;
      values.push(
        seriesId,
        chapterId,
        page.order,
        page.imageUrl,
        page.storageKey,
        page.sourceUrl,
        page.assetStatus,
        page.width,
        page.height,
        json(page.raw)
      );
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}::jsonb)`;
    });
    await client.query(`
      insert into pages (
        series_id, chapter_id, page_order, image_url, storage_key,
        source_url, asset_status, width, height, raw
      ) values ${placeholders.join(', ')}
    `, values);
  }
}

function catalogFromRows({ seriesRows, chapterRows, pageRows, tagRows, includePages }) {
  const pagesByChapter = new Map();
  for (const row of pageRows) {
    const key = chapterKey(row.series_id, row.chapter_id);
    const pages = pagesByChapter.get(key) || [];
    pages.push(pageFromRow(row));
    pagesByChapter.set(key, pages);
  }

  const chaptersBySeries = new Map();
  for (const row of chapterRows) {
    const chapters = chaptersBySeries.get(row.series_id) || [];
    chapters.push(chapterFromRow(row, includePages ? pagesByChapter.get(chapterKey(row.series_id, row.id)) || [] : null));
    chaptersBySeries.set(row.series_id, chapters);
  }

  const tagsBySeries = new Map();
  for (const row of tagRows) {
    const tags = tagsBySeries.get(row.series_id) || [];
    tags.push({ slug: row.slug, name: row.name });
    tagsBySeries.set(row.series_id, tags);
  }

  return {
    series: seriesRows.map((row) => seriesFromRow(
      row,
      chaptersBySeries.get(row.id) || [],
      tagsBySeries.get(row.id) || []
    ))
  };
}

function seriesFromRow(row, chapters, tags) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    aliases: row.aliases || [],
    coverUrl: row.cover_url || '',
    thumbnailUrl: row.thumbnail_url || '',
    coverThumbnail: row.cover_thumbnail || null,
    description: row.description || '',
    status: row.status || 'draft',
    sourceMappings: row.source_mappings || [],
    tags: tags.length ? tags : row.tags || [],
    stats: row.stats || {},
    crawlSchedule: row.crawl_schedule || { enabled: false, intervalHours: 24 },
    sourceUrl: row.source_url || '',
    adapter: row.adapter || '',
    importedAt: iso(row.imported_at),
    importMode: normalizeAssetMode(row.import_mode),
    assetStatus: normalizeAssetStatus(row.asset_status),
    imageErrorCount: Number(row.image_error_count || 0),
    lastAssetCheckAt: iso(row.last_asset_check_at),
    updatedAt: iso(row.updated_at),
    chapters
  };
}

function chapterFromRow(row, pages = null) {
  const raw = row.raw || {};
  const chapter = {
    ...raw,
    id: row.id,
    title: row.title || raw.title || row.label,
    label: row.label || raw.label || row.title || row.id,
    slug: row.slug,
    status: row.status,
    url: row.source_url || raw.url || '',
    sourceUrl: row.source_url || raw.sourceUrl || raw.url || '',
    sourceOrder: row.source_order,
    pageCount: Number(row.page_count || pages?.length || 0),
    imported: Boolean(row.imported || pages?.length),
    importMode: normalizeAssetMode(row.import_mode || raw.importMode),
    assetStatus: normalizeAssetStatus(row.asset_status || raw.assetStatus),
    imageErrorCount: Number(row.image_error_count || raw.imageErrorCount || 0),
    lastAssetCheckAt: iso(row.last_asset_check_at || raw.lastAssetCheckAt),
    publishedAt: iso(row.published_at),
    updatedAt: iso(row.updated_at)
  };
  if (pages) chapter.pages = pages;
  return chapter;
}

function pageFromRow(row) {
  const raw = row.raw || {};
  const assetStatus = normalizeAssetStatus(row.asset_status || raw.assetStatus);
  const storageKey = row.storage_key || raw.storageKey || (assetStatus === 'external' ? '' : raw.src || row.image_url);
  return {
    ...raw,
    index: Number(row.page_order),
    order: Number(row.page_order),
    imageUrl: row.image_url,
    src: raw.src || row.image_url,
    storageKey,
    sourceUrl: row.source_url || raw.sourceUrl || '',
    assetStatus,
    width: row.width,
    height: row.height
  };
}

function normalizeSeriesForStorage(rawSeries) {
  const title = rawSeries.title || 'Truyện tranh';
  const sourceMappings = rawSeries.sourceMappings || [
    {
      adapter: rawSeries.adapter || '',
      sourceUrl: rawSeries.sourceUrl || ''
    }
  ].filter((item) => item.sourceUrl);
  return {
    ...rawSeries,
    id: String(rawSeries.id || slugify(title)),
    title,
    slug: rawSeries.slug || slugify(title),
    aliases: asArray(rawSeries.aliases),
    coverUrl: rawSeries.coverUrl || rawSeries.cover || '',
    description: rawSeries.description || '',
    status: rawSeries.status || (hasAnyPages(rawSeries.chapters) ? 'public' : 'draft'),
    sourceMappings,
    tags: normalizeTags(rawSeries.tags || []),
    stats: {
      views: 0,
      follows: 0,
      readDepth: 0,
      adViews: 0,
      ...(rawSeries.stats || {})
    },
    crawlSchedule: rawSeries.crawlSchedule || { enabled: false, intervalHours: 24 },
    sourceUrl: rawSeries.sourceUrl || sourceMappings[0]?.sourceUrl || '',
    adapter: rawSeries.adapter || sourceMappings[0]?.adapter || '',
    importedAt: rawSeries.importedAt || new Date().toISOString(),
    importMode: normalizeAssetMode(rawSeries.importMode),
    assetStatus: normalizeAssetStatus(rawSeries.assetStatus || assetStatusForChapters(rawSeries.chapters)),
    imageErrorCount: Number(rawSeries.imageErrorCount || 0),
    lastAssetCheckAt: rawSeries.lastAssetCheckAt || null,
    updatedAt: rawSeries.updatedAt || new Date().toISOString(),
    chapters: asArray(rawSeries.chapters)
  };
}

function normalizeChapterForStorage(rawChapter, index) {
  const label = rawChapter.label || rawChapter.title || rawChapter.id || `Chapter ${index + 1}`;
  const pages = asArray(rawChapter.pages);
  return {
    id: String(rawChapter.id || slugify(label)),
    title: rawChapter.title || label,
    label,
    slug: rawChapter.slug || slugify(label) || String(rawChapter.id || index + 1),
    status: rawChapter.status || (rawChapter.imported || pages.length ? 'public' : 'draft'),
    sourceUrl: rawChapter.sourceUrl || rawChapter.url || '',
    sourceOrder: Number(rawChapter.sourceOrder ?? index),
    pageCount: Number(rawChapter.pageCount ?? pages.length),
    imported: Boolean(rawChapter.imported || pages.length),
    importMode: normalizeAssetMode(rawChapter.importMode),
    assetStatus: normalizeAssetStatus(rawChapter.assetStatus || assetStatusForPages(pages)),
    imageErrorCount: Number(rawChapter.imageErrorCount || 0),
    lastAssetCheckAt: rawChapter.lastAssetCheckAt || null,
    publishedAt: rawChapter.publishedAt,
    updatedAt: rawChapter.updatedAt,
    raw: rawChapter,
    pages
  };
}

export function makeUniqueChapterSlugForStorage(rawSlug, rawId, index, usedSlugs) {
  const used = usedSlugs || new Set();
  const base = slugify(rawSlug) || slugify(rawId) || `chapter-${index + 1}`;
  const idSlug = slugify(rawId);
  const candidates = [
    base,
    idSlug && idSlug !== base ? `${base}-${idSlug}` : '',
    `${base}-${index + 1}`
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }

  let counter = 2;
  let candidate = `${base}-${counter}`;
  while (used.has(candidate)) {
    counter += 1;
    candidate = `${base}-${counter}`;
  }
  used.add(candidate);
  return candidate;
}

function normalizePageForStorage(rawPage, index) {
  const imageUrl = rawPage.imageUrl || rawPage.src || '';
  const assetStatus = normalizeAssetStatus(rawPage.assetStatus || inferPageAssetStatus(rawPage));
  return {
    order: Number(rawPage.order ?? rawPage.index ?? index),
    imageUrl,
    storageKey: assetStatus === 'external' ? rawPage.storageKey || '' : rawPage.storageKey || rawPage.src || imageUrl,
    sourceUrl: rawPage.sourceUrl || '',
    assetStatus,
    width: rawPage.width || null,
    height: rawPage.height || null,
    raw: rawPage
  };
}

function normalizeAssetStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  if (status === 'local' || status === 's3' || status === 'cdn') return status;
  if (status === 'mixed') return 'mixed';
  return 'external';
}

function inferPageAssetStatus(page = {}) {
  const storageKey = String(page.storageKey || '').trim();
  const src = String(page.src || page.imageUrl || '').trim();
  if (storageKey || src.startsWith('/imports/')) return 'local';
  return 'external';
}

function assetStatusForPages(pages = []) {
  const statuses = new Set(asArray(pages).map((page) => normalizeAssetStatus(page.assetStatus || inferPageAssetStatus(page))));
  if (statuses.size === 0) return 'external';
  if (statuses.size === 1) return [...statuses][0];
  return 'mixed';
}

function assetStatusForChapters(chapters = []) {
  const statuses = new Set(asArray(chapters).map((chapter) => normalizeAssetStatus(chapter.assetStatus || assetStatusForPages(chapter.pages))));
  if (statuses.size === 0) return 'external';
  if (statuses.size === 1) return [...statuses][0];
  return 'mixed';
}

function normalizeTags(tags) {
  return asArray(tags)
    .map((tag) => {
      const name = typeof tag === 'string' ? tag : tag?.name;
      const slug = typeof tag === 'string' ? slugify(tag) : tag?.slug || slugify(name || 'tag');
      return { name: String(name || slug).trim(), slug };
    })
    .filter((tag) => tag.name && tag.slug);
}

function hasAnyPages(chapters = []) {
  return asArray(chapters).some((chapter) => asArray(chapter.pages).length > 0);
}

function chapterKey(seriesId, chapterId) {
  return `${seriesId}\u0000${chapterId}`;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function json(value) {
  return JSON.stringify(value ?? null);
}

function timestamp(value) {
  return value ? new Date(value).toISOString() : null;
}

function iso(value) {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
