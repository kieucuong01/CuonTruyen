import test from 'node:test';
import assert from 'node:assert/strict';

import { POSTGRES_SCHEMA_SQL } from '../server/postgresStore.mjs';

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
