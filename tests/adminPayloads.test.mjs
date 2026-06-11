import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAdminChapterPatch,
  buildAdminImportPayload,
  buildAdminSeriesPatch
} from '../public/routes/adminPayloads.mjs';

function formDataFrom(entries = {}) {
  return {
    get(name) {
      return Object.prototype.hasOwnProperty.call(entries, name) ? entries[name] : null;
    }
  };
}

function splitList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

test('admin import payload normalizes URLs and numeric crawl settings', () => {
  const payload = buildAdminImportPayload(formDataFrom({
    url: ' https://source.test/a\nhttps://source.test/b ',
    maxChapters: '5',
    maxPages: '20',
    assetMode: 'full_download'
  }), { splitList });

  assert.deepEqual(payload, {
    urls: ['https://source.test/a', 'https://source.test/b'],
    maxChapters: 5,
    maxPages: 20,
    assetMode: 'full_download',
    publish: true
  });
});

test('admin import payload falls back to URL-only mode and empty URL list', () => {
  assert.deepEqual(buildAdminImportPayload(formDataFrom({ url: '   ' }), { splitList }), {
    urls: [],
    maxChapters: 0,
    maxPages: 0,
    assetMode: 'image_url',
    publish: true
  });
});

test('admin series patch merges manual tags, origin tags, aliases, and local schedule', () => {
  const patch = buildAdminSeriesPatch(formDataFrom({
    title: 'Series title',
    slug: 'series-slug',
    coverUrl: '/cover.webp',
    aliases: 'Alias A, Alias B',
    tags: 'Action, Manhwa, Action',
    originType: 'manhua',
    description: 'SEO copy',
    status: 'public',
    scheduleEnabled: 'on',
    intervalHours: '12'
  }), { splitList, localOps: true });

  assert.deepEqual(patch, {
    title: 'Series title',
    slug: 'series-slug',
    coverUrl: '/cover.webp',
    aliases: ['Alias A', 'Alias B'],
    tags: ['Action', 'Manhua', 'Truyện Trung'],
    description: 'SEO copy',
    status: 'public',
    crawlSchedule: {
      enabled: true,
      intervalHours: 12
    }
  });
});

test('admin series patch omits crawl schedule when local operations are disabled', () => {
  const patch = buildAdminSeriesPatch(formDataFrom({
    title: 'Series title',
    tags: 'Fantasy',
    originType: '',
    intervalHours: '6'
  }), { splitList, localOps: false });

  assert.equal(Object.hasOwn(patch, 'crawlSchedule'), false);
  assert.deepEqual(patch.tags, ['Fantasy']);
});

test('admin chapter patch keeps title and label aligned for moderation updates', () => {
  assert.deepEqual(buildAdminChapterPatch(formDataFrom({
    'chapterTitle:c1': 'Chapter 1',
    'chapterStatus:c1': 'removed',
    'chapterReason:c1': 'Bad scan'
  }), 'c1'), {
    title: 'Chapter 1',
    label: 'Chapter 1',
    status: 'removed',
    takedownReason: 'Bad scan'
  });
});
