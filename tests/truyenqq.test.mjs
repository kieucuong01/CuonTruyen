import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractChapterImages,
  parseSeriesPage
} from '../server/adapters/truyenqq.mjs';
import { getAdapterForUrl } from '../server/adapters/index.mjs';

test('getAdapterForUrl selects the TruyenQQ adapter by hostname', () => {
  const adapter = getAdapterForUrl('https://truyenqqko.com/truyen-tranh/manh-nhat-lich-su-5968');
  assert.equal(adapter.name, 'truyenqq');
});

test('parseSeriesPage extracts TruyenQQ metadata and source-order chapters', () => {
  const html = `
    <title>Mạnh Nhất Lịch Sử chương mới nhất 388 - TruyenQQ</title>
    <meta itemprop="name" content="Mạnh Nhất Lịch Sử">
    <meta itemprop="image" content="https://truyenqqko.com/img/cover.jpg">
    <div class="list_chapter">
      <div class="works-chapter-item"><a href="/truyen-tranh/manh-nhat-lich-su-5968-chap-388">Chương 388</a></div>
      <div class="works-chapter-item"><a href="/truyen-tranh/manh-nhat-lich-su-5968-chap-387">Chương 387</a></div>
      <div class="works-chapter-item"><a href="/truyen-tranh/other-999-chap-1">Chương 1</a></div>
    </div>
  `;

  const result = parseSeriesPage(html, 'https://truyenqqko.com/truyen-tranh/manh-nhat-lich-su-5968');

  assert.equal(result.title, 'Mạnh Nhất Lịch Sử');
  assert.equal(result.coverUrl, 'https://truyenqqko.com/img/cover.jpg');
  assert.deepEqual(result.chapters.map((chapter) => chapter.label), ['Chương 387', 'Chương 388']);
  assert.deepEqual(result.chapters.map((chapter) => chapter.url), [
    'https://truyenqqko.com/truyen-tranh/manh-nhat-lich-su-5968-chap-387',
    'https://truyenqqko.com/truyen-tranh/manh-nhat-lich-su-5968-chap-388'
  ]);
});

test('extractChapterImages extracts only TruyenQQ comic page images', () => {
  const html = `
    <img src="https://st.truyenqqko.com/template/frontend/images/logo.png" alt="TruyenQQ">
    <div id="page_0" class="page-chapter">
      <img class="lazy" src="https://i178.truyenvua.com/5968/387/page-001.jpg?r=1" data-original="https://i178.truyenvua.com/5968/387/page-001.jpg?r=1" data-cdn="https://i178.truyenvua.com/5968/387/page-001.jpg" />
    </div>
    <div id="page_1" class="page-chapter">
      <img class="lazy" data-original="https://i178.truyenvua.com/5968/387/page-002.webp?r=2" />
    </div>
    <img class="lazy-image" data-src="https://avatar.truyenvua.com/avatar.jpg" alt="avatar">
  `;

  const images = extractChapterImages(html, 'https://truyenqqko.com/truyen-tranh/manh-nhat-lich-su-5968-chap-388');

  assert.deepEqual(images, [
    'https://i178.truyenvua.com/5968/387/page-001.jpg?r=1',
    'https://i178.truyenvua.com/5968/387/page-002.webp?r=2'
  ]);
});
