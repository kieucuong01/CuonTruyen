import assert from 'node:assert/strict';
import test from 'node:test';

import { createAdminSaveActions } from '../public/routes/adminSaveActions.mjs';

function createButton() {
  return {
    disabled: false
  };
}

function createChapterRow(id) {
  return {
    dataset: { adminChapter: id }
  };
}

function createForm({ seriesId = 'series 1', values = {}, chapters = [] } = {}) {
  const button = createButton();
  return {
    button,
    dataset: { adminSeries: seriesId },
    values: {
      title: 'Series title',
      slug: 'series-slug',
      coverUrl: '/cover.webp',
      aliases: 'Alias A, Alias B',
      tags: 'Action, Manhwa',
      originType: 'manhua',
      description: 'SEO copy',
      status: 'public',
      scheduleEnabled: 'on',
      intervalHours: '12',
      ...values
    },
    querySelector(selector) {
      if (selector === 'button[type="submit"]') return button;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '[data-admin-chapter]') return chapters;
      return [];
    }
  };
}

function createActions(overrides = {}) {
  const calls = [];
  const invalidations = [];
  const controls = [];
  let renderCount = 0;
  const actions = createAdminSaveActions({
    adminHeaders: () => ({ authorization: 'Bearer admin' }),
    canRunLocalOperations: () => true,
    fetchJson: async (url, options) => {
      calls.push({ url, options });
      return {};
    },
    formDataFactory: (form) => ({
      get(name) {
        return form.values[name] ?? null;
      }
    }),
    invalidateContentCache: () => invalidations.push('invalidate'),
    renderAdmin: async () => {
      renderCount += 1;
    },
    setControlPending: (button) => controls.push(button),
    splitList: (value) => String(value || '').split(',').map((item) => item.trim()).filter(Boolean),
    ...overrides
  });
  return {
    actions,
    calls,
    controls,
    invalidations,
    get renderCount() {
      return renderCount;
    }
  };
}

test('admin save action patches series metadata, chapter moderation, invalidates, and rerenders', async () => {
  const context = createActions();
  const { actions, calls, controls, invalidations } = context;
  const form = createForm({
    chapters: [
      createChapterRow('chapter 1'),
      createChapterRow('chapter/2')
    ],
    values: {
      'chapterTitle:chapter 1': 'Chapter One',
      'chapterStatus:chapter 1': 'public',
      'chapterReason:chapter 1': '',
      'chapterTitle:chapter/2': 'Chapter Two',
      'chapterStatus:chapter/2': 'removed',
      'chapterReason:chapter/2': 'Bad scan'
    }
  });

  await actions.handleAdminSave({ preventDefault() {}, currentTarget: form });

  assert.equal(calls.length, 3);
  assert.equal(calls[0].url, '/api/admin/series/series%201');
  assert.equal(calls[0].options.method, 'PATCH');
  assert.deepEqual(calls[0].options.headers, { authorization: 'Bearer admin' });
  assert.deepEqual(JSON.parse(calls[0].options.body), {
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
  assert.equal(calls[1].url, '/api/admin/series/series%201/chapters/chapter%201');
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    title: 'Chapter One',
    label: 'Chapter One',
    status: 'public',
    takedownReason: ''
  });
  assert.equal(calls[2].url, '/api/admin/series/series%201/chapters/chapter%2F2');
  assert.deepEqual(JSON.parse(calls[2].options.body), {
    title: 'Chapter Two',
    label: 'Chapter Two',
    status: 'removed',
    takedownReason: 'Bad scan'
  });
  assert.deepEqual(controls, [form.button]);
  assert.deepEqual(invalidations, ['invalidate']);
  assert.equal(context.renderCount, 1);
});

test('admin save action omits local crawl schedule when local operations are disabled', async () => {
  const { actions, calls } = createActions({
    canRunLocalOperations: () => false
  });
  const form = createForm();

  await actions.handleAdminSave({ preventDefault() {}, currentTarget: form });

  const seriesPatch = JSON.parse(calls[0].options.body);
  assert.equal(Object.hasOwn(seriesPatch, 'crawlSchedule'), false);
});

test('admin save action stops after a failed series patch', async () => {
  const context = createActions({
    fetchJson: async (url, options) => {
      context.calls.push({ url, options });
      throw new Error('save failed');
    }
  });
  const form = createForm({ chapters: [createChapterRow('c1')] });

  await assert.rejects(
    () => context.actions.handleAdminSave({ preventDefault() {}, currentTarget: form }),
    /save failed/
  );

  assert.equal(context.calls.length, 1);
  assert.deepEqual(context.invalidations, []);
  assert.equal(context.renderCount, 0);
});
