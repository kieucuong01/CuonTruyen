import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatCrawlDuration,
  formatCrawlRate,
  renderCrawlQueueRunningJob,
  renderCrawlQueueStatusView,
  renderCrawlQueueWaitingList
} from '../public/routes/adminCrawlQueueView.mjs';

test('crawl queue status view summarizes running, waiting, and failed jobs', () => {
  const view = renderCrawlQueueStatusView({
    counts: { running: 1, queued: 2, retrying: 1, failed: 1 },
    staleResetCount: 2,
    worker: { embeddedEnabled: true, active: true },
    running: [{
      progress: {
        message: 'Đang crawl <demo>',
        totalChapters: 4,
        processedChapters: 2,
        totalImages: 10,
        processedImages: 5,
        imagesPerMinute: 12.34,
        etaSeconds: 65
      },
      payload: { url: 'https://example.test/<series>' }
    }],
    queued: [{ payload: { mode: 'image_urls', url: 'https://queued.test/a' } }],
    retrying: [{ payload: { mode: 'refresh-image-urls', seriesId: 'demo-series' } }],
    failed: [{ id: 'job-1', payload: { mode: 'full' }, error: 'Boom <bad>' }]
  });

  assert.equal(view.className, 'status-line crawl-queue-status warning');
  assert.match(view.html, /Đang crawl &lt;demo&gt;/);
  assert.match(view.html, /Crawler local đang xử lý queue/);
  assert.match(view.html, /Đã tự mở khóa 2 job bị kẹt/);
  assert.match(view.html, /Chapter: 2\/4/);
  assert.match(view.html, /Ảnh: 5\/10/);
  assert.match(view.html, /1 phút 5 giây/);
  assert.match(view.html, /https:\/\/example\.test\/&lt;series&gt;/);
  assert.match(view.html, /Boom &lt;bad&gt;/);
});

test('crawl queue status view reports idle and disabled worker states', () => {
  const view = renderCrawlQueueStatusView({
    counts: { running: 0, queued: 0, retrying: 0, failed: 0 },
    worker: { embeddedEnabled: false, active: false }
  });

  assert.equal(view.className, 'status-line crawl-queue-status');
  assert.match(view.html, /Queue crawl đang rảnh/);
  assert.match(view.html, /Crawler embedded đang tắt/);
});

test('crawl queue waiting list escapes job labels and limits output', () => {
  const html = renderCrawlQueueWaitingList('Job <failed>', [
    { payload: { mode: '<mode>', url: 'https://a.test/<1>' }, error: '<err-1>' },
    { payload: { seriesId: 'series-2' } },
    { id: 'job-3', payload: {} },
    { id: 'job-4', payload: {} },
    { id: 'job-5', payload: {} }
  ]);

  assert.match(html, /Job &lt;failed&gt;/);
  assert.match(html, /&lt;mode&gt;/);
  assert.match(html, /https:\/\/a\.test\/&lt;1&gt;/);
  assert.match(html, /&lt;err-1&gt;/);
  assert.doesNotMatch(html, /job-5/);
});

test('crawl queue format helpers keep Vietnamese rate and duration labels stable', () => {
  assert.equal(formatCrawlDuration(undefined), 'đang tính');
  assert.equal(formatCrawlDuration(5), '5 giây');
  assert.equal(formatCrawlDuration(3600), '1 giờ');
  assert.equal(formatCrawlDuration(3665), '1 giờ 1 phút');
  assert.equal(formatCrawlRate(12.345, 'ảnh/phút'), '12,3 ảnh/phút');
  assert.equal(formatCrawlRate(0, 'ảnh/phút'), '0 ảnh/phút');
});

test('running job view falls back to downloaded image counters', () => {
  const html = renderCrawlQueueRunningJob({
    progress: {
      totalImages: 8,
      downloadedImages: 3,
      etaSeconds: -1
    }
  });

  assert.match(html, /Ảnh: 3\/8/);
  assert.match(html, /ETA: đang tính/);
});
