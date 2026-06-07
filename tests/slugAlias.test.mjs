import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildReaderChapterPayload,
  findSeriesBySlug
} from '../server/contentStore.mjs';
import { slugify } from '../server/utils.mjs';

test('slugify preserves Vietnamese d with stroke as d', () => {
  assert.equal(slugify('Đạo Quỷ Dị Tiên'), 'dao-quy-di-tien');
  assert.equal(slugify('Người Chơi Mới Cấp Tối Đa'), 'nguoi-choi-moi-cap-toi-da');
  assert.equal(slugify('Bắt Đầu Đánh Dấu Hoang Cổ Thánh Thể'), 'bat-dau-danh-dau-hoang-co-thanh-the');
});

test('series lookup accepts legacy slug aliases', () => {
  const catalog = {
    series: [{
      id: 'dao-quy',
      title: 'Đạo Quỷ Dị Tiên',
      slug: 'dao-quy-di-tien',
      aliases: ['ao-quy-di-tien'],
      status: 'public',
      chapters: [{
        id: 'chuong-1',
        label: 'Chương 1',
        slug: 'chuong-1',
        status: 'public',
        imported: true,
        pageCount: 1,
        pages: [{ imageUrl: '/imports/dao/001.jpg' }]
      }]
    }]
  };

  const series = findSeriesBySlug(catalog, 'ao-quy-di-tien');
  assert.equal(series.slug, 'dao-quy-di-tien');

  const payload = buildReaderChapterPayload(catalog, 'ao-quy-di-tien', 'chuong-1');
  assert.equal(payload.series.slug, 'dao-quy-di-tien');
  assert.equal(payload.chapter.slug, 'chuong-1');
});
