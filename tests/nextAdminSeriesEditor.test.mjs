import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  buildAdminChapterPatch,
  buildAdminSeriesPatch,
  detectOriginType,
  findAdminSeriesForEditor
} from '../src/components/admin/adminSeriesEditorState.mjs';

test('next admin series detail route no longer loads the legacy SPA bundle', () => {
  const pageSource = fs.readFileSync('src/app/admin/series/[seriesId]/page.tsx', 'utf8');
  const editorSource = fs.readFileSync('src/components/admin/AdminSeriesEditorIsland.tsx', 'utf8');

  assert.match(pageSource, /AdminSeriesEditorIsland/);
  assert.doesNotMatch(pageSource, /LegacyAdminShell/);
  assert.doesNotMatch(editorSource, /\/app\.js|\/config\.js|LegacyAdminShell/);
});

test('next admin series editor uses content APIs and keeps local crawler pipeline out', () => {
  const editorSource = fs.readFileSync('src/components/admin/AdminSeriesEditorIsland.tsx', 'utf8');

  assert.match(editorSource, /\/api\/admin\/catalog/);
  assert.match(editorSource, /\/api\/admin\/series\/.+chapters/);
  assert.match(editorSource, /\/api\/admin\/series\/.+crawl-schedule/);
  assert.doesNotMatch(editorSource, /import-jobs|s3-sync|publish-production|update-chapters|production-check/);
});

test('admin series editor helpers build metadata and chapter patches', () => {
  const patch = buildAdminSeriesPatch({
    title: '  Demo Story  ',
    slug: 'demo-story',
    coverUrl: '/imports/demo/cover.webp',
    aliases: 'Demo, Demo Story',
    tags: 'Action, Manhua',
    originType: 'manhwa',
    description: 'SEO copy',
    status: 'public',
    scheduleEnabled: true,
    intervalHours: '6'
  });

  assert.deepEqual(patch, {
    title: 'Demo Story',
    slug: 'demo-story',
    coverUrl: '/imports/demo/cover.webp',
    aliases: ['Demo', 'Demo Story'],
    tags: ['Action', 'Manhwa', 'Truyện Hàn'],
    description: 'SEO copy',
    status: 'public',
    crawlSchedule: { enabled: true, intervalHours: 6 }
  });

  assert.equal(detectOriginType(['Action', 'Truyện Trung']), 'manhua');
  assert.deepEqual(buildAdminChapterPatch('chapter-1', {
    'chapterTitle:chapter-1': 'Chapter 1',
    'chapterStatus:chapter-1': 'removed',
    'chapterReason:chapter-1': 'Lỗi ảnh'
  }), {
    title: 'Chapter 1',
    label: 'Chapter 1',
    status: 'removed',
    takedownReason: 'Lỗi ảnh'
  });
});

test('findAdminSeriesForEditor accepts stable id or slug', () => {
  const catalog = {
    series: [
      { id: 'series-1', slug: 'demo-story', title: 'Demo Story' }
    ]
  };

  assert.equal(findAdminSeriesForEditor(catalog, 'series-1')?.title, 'Demo Story');
  assert.equal(findAdminSeriesForEditor(catalog, 'demo-story')?.id, 'series-1');
  assert.equal(findAdminSeriesForEditor(catalog, 'missing'), null);
});
