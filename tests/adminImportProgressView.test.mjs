import test from 'node:test';
import assert from 'node:assert/strict';

import { renderImportProgressView } from '../public/routes/adminImportProgressView.mjs';

test('import progress view summarizes batch, chapter, image, and speed metrics', () => {
  const view = renderImportProgressView({
    status: 'running',
    progress: {
      message: 'Đang import <demo>',
      currentChapterLabel: 'Chapter <1>',
      phase: 'download',
      totalSeries: 2,
      processedSeries: 1,
      totalChapters: 4,
      processedChapters: 2,
      totalImages: 10,
      processedImages: 5,
      usableImages: 7,
      downloadedImages: 3,
      skippedExistingImages: 4,
      failedImages: 1,
      imagesPerMinute: 12.34,
      chaptersPerMinute: 2.5,
      etaSeconds: 65,
      imageConcurrency: 6,
      errorCount: 9,
      errors: ['old', 'err <one>', 'err two', 'err three']
    }
  });

  assert.equal(view.className, 'status-line import-progress');
  assert.match(view.html, /Đang import &lt;demo&gt;/);
  assert.match(view.html, /Chapter &lt;1&gt;/);
  assert.match(view.html, /width:50%/);
  assert.match(view.html, /Truyện: 1\/2/);
  assert.match(view.html, /Chapter: 2\/4/);
  assert.match(view.html, /Ảnh xử lý: 5\/10/);
  assert.match(view.html, /Ảnh dùng được: 7/);
  assert.match(view.html, /Tải mới: 3/);
  assert.match(view.html, /Skip có sẵn: 4/);
  assert.match(view.html, /Ảnh lỗi skip: 1/);
  assert.match(view.html, /Tốc độ ảnh: 12,3 ảnh\/phút/);
  assert.match(view.html, /Tốc độ chapter: 2,5 chapter\/phút/);
  assert.match(view.html, /ETA: 1 phút 5 giây/);
  assert.match(view.html, /Concurrency: 6/);
  assert.match(view.html, /Trạng thái: running/);
  assert.match(view.html, /Lỗi: 9/);
  assert.doesNotMatch(view.html, /old/);
  assert.match(view.html, /err &lt;one&gt;/);
});

test('import progress view marks failed and admin update statuses', () => {
  const view = renderImportProgressView({
    status: 'failed',
    progress: {
      currentSeriesUrl: 'https://example.test/<series>',
      errors: ['Boom <bad>']
    }
  }, { isAdminUpdateStatus: true });

  assert.equal(view.className, 'status-line import-progress error admin-wide admin-update-status');
  assert.match(view.html, /https:\/\/example\.test\/&lt;series&gt;/);
  assert.match(view.html, /Boom &lt;bad&gt;/);
  assert.match(view.html, /Trạng thái: failed/);
});

test('import progress view falls back to usable images from downloaded and skipped counts', () => {
  const view = renderImportProgressView({
    status: 'running',
    progress: {
      totalImages: 20,
      downloadedImages: 5,
      skippedExistingImages: 7
    }
  });

  assert.match(view.html, /Ảnh dùng được: 12/);
  assert.match(view.html, /Ảnh xử lý: 5\/20/);
});
