import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { createAdminRoute } from '../public/routes/admin.mjs';

function makeElement(name = 'el', listeners = []) {
  return {
    name,
    dataset: {},
    style: {},
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() {
        return false;
      }
    },
    value: '',
    checked: false,
    disabled: false,
    textContent: '',
    innerHTML: '',
    src: '',
    href: '',
    isConnected: false,
    addEventListener(type, handler) {
      assert.equal(typeof handler, 'function', `bad handler for ${name}:${type}`);
      listeners.push({ name, type, handlerName: handler.name || 'anonymous' });
    },
    removeEventListener() {},
    setAttribute() {},
    getAttribute() {
      return '';
    },
    appendChild() {},
    remove() {},
    closest() {
      return makeElement(`${name}:closest`, listeners);
    },
    querySelector(selector) {
      return makeElement(`${name} ${selector}`, listeners);
    },
    querySelectorAll(selector) {
      return [makeElement(`${name} ${selector}[0]`, listeners)];
    }
  };
}

function createFakeApp(listeners) {
  const app = makeElement('app', listeners);
  Object.defineProperty(app, 'innerHTML', {
    get() {
      return this._html || '';
    },
    set(value) {
      this._html = String(value || '');
    }
  });
  app.querySelector = (selector) => makeElement(selector, listeners);
  app.querySelectorAll = (selector) => [makeElement(`${selector}[0]`, listeners)];
  return app;
}

const sampleSeries = {
  id: 's1',
  slug: 'sample-series',
  title: 'Sample Series',
  status: 'public',
  cover: '/imports/sample/cover.webp',
  coverThumb: '/imports/sample/cover-thumb.webp',
  sourceUrl: 'https://example.test/series',
  sourceMappings: [{ sourceUrl: 'https://example.test/series' }],
  tags: ['manhwa'],
  aliases: [],
  description: 'Sample',
  chapters: [{
    id: 'c1',
    slug: 'chuong-1',
    label: 'Chuong 1',
    title: 'Chuong 1',
    status: 'public',
    pages: ['/imports/sample/c1/001.webp'],
    sourceOrder: 1
  }],
  stats: { views: 10, adViews: 0, donateClicks: 0 }
};

function createRouteForSmoke(app, overrides = {}) {
  return createAdminRoute({
    adminHeaders: () => ({ authorization: 'Bearer test-token' }),
    app,
    chapterHrefSegment: (chapter) => chapter.slug || chapter.id,
    escapeAttr: (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;'),
    escapeHtml: (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;'),
    fetchJson: async (url) => {
      if (url === '/api/admin/series') return { series: [sampleSeries] };
      if (url.startsWith('/api/admin/bulletin/messages')) {
        return { messages: [{ id: 'm1', text: 'Hello', pinned: false, createdAt: new Date().toISOString() }] };
      }
      if (url === '/api/admin/s3-sync/status') return { running: false, current: null };
      if (url === '/api/admin/import-jobs') return { jobs: [] };
      if (url === '/api/admin/import-jobs/summary') return { counts: {}, queued: [], retrying: [], failed: [], running: [] };
      if (url === '/api/admin/config') return { ok: true };
      if (url === '/api/admin/events') return { events: [] };
      return {};
    },
    invalidateContentCache: () => {},
    loadCatalog: async () => ({ series: [sampleSeries] }),
    renderTopbar: () => '<nav>topbar</nav>',
    route: () => {},
    clearControlPending: () => {},
    setControlPending: () => {},
    splitList: (value) => String(value || '').split(/\n+/).map((item) => item.trim()).filter(Boolean),
    stopReaderRuntime: () => {},
    ...overrides
  });
}

test('admin route has no missing referenced handler functions', () => {
  const source = fs.readFileSync('public/routes/admin.mjs', 'utf8');
  const defs = new Set([...source.matchAll(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((match) => match[1]));
  for (const match of source.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) defs.add(match[1]);
  for (const match of source.matchAll(/import\s+\{([^}]+)\}\s+from/g)) {
    for (const raw of match[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/).pop().trim();
      if (name) defs.add(name);
    }
  }
  const paramMatch = source.match(/export function createAdminRoute\s*\(\s*\{([\s\S]*?)\}\s*\)\s*\{/);
  if (paramMatch) {
    for (const raw of paramMatch[1].split(',')) {
      const name = raw.trim().split(':').pop().trim();
      if (name) defs.add(name);
    }
  }

  const refs = new Set();
  for (const match of source.matchAll(/addEventListener\([^,]+,\s*([A-Za-z_$][\w$]*)\)/g)) refs.add(match[1]);
  for (const match of source.matchAll(/\b(handle[A-Za-z0-9_$]+)\b/g)) refs.add(match[1]);
  for (const match of source.matchAll(/\b(poll[A-Za-z0-9_$]+)\b/g)) refs.add(match[1]);
  for (const match of source.matchAll(/\b(delay)\s*\(/g)) refs.add(match[1]);

  assert.deepEqual([...refs].filter((name) => !defs.has(name)).sort(), []);
});

test('admin route renders dashboard and series detail with required handlers bound', async () => {
  const originalLocalStorage = globalThis.localStorage;
  const originalCss = globalThis.CSS;
  const originalLocation = globalThis.location;
  const originalWindow = globalThis.window;
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;

  const listeners = [];
  const app = createFakeApp(listeners);
  globalThis.localStorage = {
    getItem(key) {
      return key === 'comic-admin-token' ? 'test-token' : 'admin@example.test';
    },
    setItem() {},
    removeItem() {}
  };
  globalThis.CSS = { escape: (value) => String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&') };
  globalThis.location = { origin: 'http://localhost:54533', hostname: 'localhost', href: 'http://localhost:54533/admin' };
  globalThis.window = { location: globalThis.location };
  globalThis.setInterval = () => 1;
  globalThis.clearInterval = () => {};

  try {
    const route = createRouteForSmoke(app);
    await route.renderAdmin();
    assert.match(app.innerHTML, /admin/i);
    await route.renderAdminSeriesDetail('s1');
    assert.match(app.innerHTML, /Sample Series/);
    assert.match(app.innerHTML, /Crawl chapter/);
    assert.match(app.innerHTML, /Optimize/);
    assert.match(app.innerHTML, /Sync .*S3/);
    assert.doesNotMatch(app.innerHTML, /Export static API/);
    assert.doesNotMatch(app.innerHTML, /Sync static API/);
    assert.doesNotMatch(app.innerHTML, /static API/i);
    assert.match(app.innerHTML, /Check production/);

    const boundNames = new Set(listeners.map((item) => item.handlerName));
    for (const handlerName of [
      'handleImport',
      'handleAdminBulletinSubmit',
      'handleAdminBulletinPin',
      'handleUpdateChapters',
      'handleProductionPublish',
      'handleProductionStep',
      'handleProductionCheck',
      'handleAdminSave'
    ]) {
      assert.equal(boundNames.has(handlerName), true, `${handlerName} should be bound`);
    }
  } finally {
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
    if (originalCss === undefined) delete globalThis.CSS;
    else globalThis.CSS = originalCss;
    if (originalLocation === undefined) delete globalThis.location;
    else globalThis.location = originalLocation;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});

test('admin S3 status renders failed item details without a ReferenceError', async () => {
  const originalLocalStorage = globalThis.localStorage;
  const originalCss = globalThis.CSS;
  const originalLocation = globalThis.location;
  const originalWindow = globalThis.window;
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;

  const listeners = [];
  const app = createFakeApp(listeners);
  const s3Target = makeElement('s3-status', listeners);
  s3Target.isConnected = true;
  s3Target.querySelector = () => null;

  app.querySelector = (selector) => {
    if (selector === '[data-s3-sync-status]') return s3Target;
    return makeElement(selector, listeners);
  };

  globalThis.localStorage = {
    getItem(key) {
      return key === 'comic-admin-token' ? 'test-token' : 'admin@example.test';
    },
    setItem() {},
    removeItem() {}
  };
  globalThis.CSS = { escape: (value) => String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&') };
  globalThis.location = { origin: 'http://localhost:54533', hostname: 'localhost', href: 'http://localhost:54533/admin' };
  globalThis.window = { location: globalThis.location };
  globalThis.setInterval = () => 1;
  globalThis.clearInterval = () => {};

  try {
    const route = createRouteForSmoke(app, {
      fetchJson: async (url) => {
        if (url === '/api/admin/series') return { series: [sampleSeries] };
        if (url.startsWith('/api/admin/bulletin/messages')) return { messages: [] };
        if (url.startsWith('/api/admin/analytics/summary')) return null;
        if (url === '/api/admin/production-status') return { statuses: {}, stateFileExists: false };
        if (url === '/api/admin/import-jobs/summary') return { counts: {}, queued: [], retrying: [], failed: [], running: [] };
        if (url === '/api/admin/s3-sync/status') {
          return {
            exists: true,
            status: 'failed',
            total: 1,
            checked: 1,
            failed: 1,
            failedItems: [{ key: 'imports/demo/001.jpg', error: 'timeout' }]
          };
        }
        return {};
      }
    });

    await route.renderAdmin();
    await new Promise((resolve) => setImmediate(resolve));

    assert.doesNotMatch(s3Target.textContent, /failedItems is not defined/);
    assert.match(s3Target.innerHTML, /imports\/demo\/001\.jpg/);
  } finally {
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
    if (originalCss === undefined) delete globalThis.CSS;
    else globalThis.CSS = originalCss;
    if (originalLocation === undefined) delete globalThis.location;
    else globalThis.location = originalLocation;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});

test('revenue dashboard overrides the admin form grid layout', () => {
  const css = fs.readFileSync('public/styles.css', 'utf8');

  assert.match(css, /\.admin-panel\.revenue-dashboard\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
  assert.match(css, /\.revenue-metrics\s*\{[^}]*minmax\(140px,\s*1fr\)/s);
});

test('production admin hides local crawl, S3, and publish pipeline controls', async () => {
  const originalLocalStorage = globalThis.localStorage;
  const originalCss = globalThis.CSS;
  const originalLocation = globalThis.location;
  const originalWindow = globalThis.window;
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const originalConfig = globalThis.COMIC_READER_CONFIG;

  const listeners = [];
  const app = createFakeApp(listeners);
  globalThis.localStorage = {
    getItem(key) {
      return key === 'comic-admin-token' ? 'test-token' : 'admin@example.test';
    },
    setItem() {},
    removeItem() {}
  };
  globalThis.CSS = { escape: (value) => String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&') };
  globalThis.location = { origin: 'https://cuontruyen.vercel.app', hostname: 'cuontruyen.vercel.app', href: 'https://cuontruyen.vercel.app/admin' };
  globalThis.window = { location: globalThis.location, COMIC_READER_CONFIG: { enableLocalCrawlerUi: false } };
  globalThis.COMIC_READER_CONFIG = { enableLocalCrawlerUi: false };
  globalThis.setInterval = () => 1;
  globalThis.clearInterval = () => {};

  try {
    const route = createRouteForSmoke(app);
    await route.renderAdmin();
    assert.match(app.innerHTML, /Production admin/);
    assert.doesNotMatch(app.innerHTML, /data-import-form/);
    assert.doesNotMatch(app.innerHTML, /data-s3-sync-status/);

    await route.renderAdminSeriesDetail('s1');
    assert.match(app.innerHTML, /Production admin/);
    assert.doesNotMatch(app.innerHTML, /data-update-chapters=/);
    assert.doesNotMatch(app.innerHTML, /data-publish-production=/);
    assert.doesNotMatch(app.innerHTML, /data-production-step=/);
    assert.doesNotMatch(app.innerHTML, /Production pipeline/);
  } finally {
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
    if (originalCss === undefined) delete globalThis.CSS;
    else globalThis.CSS = originalCss;
    if (originalLocation === undefined) delete globalThis.location;
    else globalThis.location = originalLocation;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalConfig === undefined) delete globalThis.COMIC_READER_CONFIG;
    else globalThis.COMIC_READER_CONFIG = originalConfig;
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});
