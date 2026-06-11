import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { POSTGRES_SCHEMA_SQL, makeUniqueChapterSlugForStorage } from '../server/postgresStore.mjs';

test('postgres schema includes production catalog tables and indexes', () => {
  for (const table of ['series', 'chapters', 'pages', 'tags', 'series_tags', 'crawl_jobs', 'analytics_events']) {
    assert.match(POSTGRES_SCHEMA_SQL, new RegExp(`create table if not exists ${table}`));
  }

  for (const index of [
    'idx_series_slug',
    'idx_series_status_updated',
    'idx_chapters_series_slug',
    'idx_chapters_series_order',
    'idx_pages_chapter_order',
    'idx_series_tags_tag',
    'idx_crawl_jobs_source_status',
    'idx_crawl_jobs_queue',
    'idx_analytics_events_created_at',
    'idx_analytics_events_type'
  ]) {
    assert.match(POSTGRES_SCHEMA_SQL, new RegExp(`create index if not exists ${index}`));
  }
});

test('postgres schema includes durable crawl worker queue columns', () => {
  for (const column of [
    'payload jsonb',
    'result jsonb',
    'run_after timestamptz',
    'attempts integer',
    'locked_by text',
    'last_error text'
  ]) {
    assert.match(POSTGRES_SCHEMA_SQL, new RegExp(column));
  }
});

test('postgres catalog summary queries avoid chapter raw payloads', () => {
  const source = fs.readFileSync(new URL('../server/postgresStore.mjs', import.meta.url), 'utf8');

  assert.match(source, /const chapterColumns = includePages \? '\*' : CHAPTER_SUMMARY_COLUMNS/);
  assert.match(source, /select \$\{chapterColumns\} from chapters/);
  assert.doesNotMatch(source.match(/const CHAPTER_SUMMARY_COLUMNS = \[[\s\S]+?\]\.join/)?.[0] || '', /raw/);
});

test('postgres chapter storage keeps duplicate slugs unique per series', () => {
  const used = new Set();

  assert.equal(makeUniqueChapterSlugForStorage('doc-tu-dau', 'chapter-a', 0, used), 'doc-tu-dau');
  assert.equal(makeUniqueChapterSlugForStorage('doc-tu-dau', 'chapter-b', 1, used), 'doc-tu-dau-chapter-b');
  assert.equal(makeUniqueChapterSlugForStorage('doc-tu-dau', 'chapter-b', 2, used), 'doc-tu-dau-3');
});
