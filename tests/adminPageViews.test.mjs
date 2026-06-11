import test from 'node:test';
import assert from 'node:assert/strict';

import {
  renderAdminDashboardPage,
  renderAdminSeriesDetailPage
} from '../public/routes/adminPageViews.mjs';

const escapeHtml = (value) => String(value).replace(/[&<>"]/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;'
}[char]));

const escapeAttr = escapeHtml;

test('admin dashboard page composes local panels, flash, revenue, and series cards', () => {
  const html = renderAdminDashboardPage({
    topbarHtml: '<nav>top</nav>',
    sessionBarHtml: '<section>session</section>',
    localOps: true,
    productionNoticeHtml: '<aside>production-only</aside>',
    crawlQueuePanelHtml: '<section>crawl-queue</section>',
    bulletinPanelHtml: '<section>bulletin</section>',
    s3SyncPanelHtml: '<section>s3-sync</section>',
    revenueDashboardHtml: '<section>revenue</section>',
    flashMessage: '<saved>',
    series: [{ id: 's1' }, { id: 's2' }],
    renderSeriesCard: (series) => `<article>${series.id}</article>`,
    escapeHtml
  });

  assert.match(html, /<main class="site-shell admin-shell">/);
  assert.match(html, /<nav>top<\/nav>/);
  assert.match(html, /data-import-form/);
  assert.match(html, /crawl-queue/);
  assert.match(html, /bulletin/);
  assert.match(html, /s3-sync/);
  assert.match(html, /revenue/);
  assert.match(html, /&lt;saved&gt;/);
  assert.match(html, /<article>s1<\/article><article>s2<\/article>/);
  assert.doesNotMatch(html, /production-only/);
});

test('admin dashboard page uses production notice and empty state without local controls', () => {
  const html = renderAdminDashboardPage({
    topbarHtml: '',
    sessionBarHtml: '',
    localOps: false,
    productionNoticeHtml: '<aside>production-only</aside>',
    crawlQueuePanelHtml: '<section>crawl-queue</section>',
    bulletinPanelHtml: '<section>bulletin</section>',
    s3SyncPanelHtml: '<section>s3-sync</section>',
    revenueDashboardHtml: '',
    flashMessage: '',
    series: [],
    renderSeriesCard: () => '<article>card</article>',
    escapeHtml
  });

  assert.match(html, /production-only/);
  assert.match(html, /empty-state/);
  assert.doesNotMatch(html, /data-import-form/);
  assert.doesNotMatch(html, /crawl-queue/);
  assert.doesNotMatch(html, /s3-sync/);
});

test('admin series detail page composes navigation, escaped flash, and editor state', () => {
  const html = renderAdminSeriesDetailPage({
    topbarHtml: '<nav>top</nav>',
    sessionBarHtml: '<section>session</section>',
    localOps: false,
    productionNoticeHtml: '<aside>production-only</aside>',
    flashMessage: '<updated>',
    series: { id: 's1', slug: 'series/<slug>' },
    editorHtml: '<form data-admin-series>editor</form>',
    escapeHtml,
    escapeAttr
  });

  assert.match(html, /admin-detail-shell/);
  assert.match(html, /href="\/admin"/);
  assert.match(html, /href="\/truyen\/series\/&lt;slug&gt;"/);
  assert.match(html, /&lt;updated&gt;/);
  assert.match(html, /production-only/);
  assert.match(html, /data-admin-series/);
});

test('admin series detail page renders a safe empty state when the series is missing', () => {
  const html = renderAdminSeriesDetailPage({
    topbarHtml: '',
    sessionBarHtml: '',
    localOps: true,
    productionNoticeHtml: '<aside>production-only</aside>',
    flashMessage: '',
    series: null,
    editorHtml: '',
    escapeHtml,
    escapeAttr
  });

  assert.match(html, /empty-state/);
  assert.doesNotMatch(html, /production-only/);
  assert.doesNotMatch(html, /\/truyen\//);
});
