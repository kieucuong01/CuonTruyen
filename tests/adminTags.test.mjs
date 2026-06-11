import assert from 'node:assert/strict';
import test from 'node:test';

import {
  detectOriginType,
  getManualTagNames,
  getOriginTagOptions,
  getSeriesTagNames,
  isOriginTagName,
  mergeTagsWithOrigin,
  normalizeAdminTagName,
  renderOriginTagPicker,
  uniqueTagNames
} from '../public/routes/adminTags.mjs';

test('admin tag helpers normalize Vietnamese and detect origin tags', () => {
  assert.equal(normalizeAdminTagName('Truyện Hàn'), 'truyen-han');
  assert.equal(normalizeAdminTagName('Truyện Trung'), 'truyen-trung');
  assert.equal(normalizeAdminTagName('Đô Thị / Action'), 'do-thi-action');

  assert.equal(isOriginTagName('Manhwa'), true);
  assert.equal(isOriginTagName('Truyện Hàn'), true);
  assert.equal(isOriginTagName('Fantasy'), false);
  assert.equal(detectOriginType(['Fantasy', 'Truyện Trung']), 'manhua');
  assert.equal(detectOriginType(['Manhwa']), 'manhwa');
  assert.equal(detectOriginType(['Fantasy']), '');
});

test('admin tag helpers separate manual tags from origin tags', () => {
  const series = {
    tags: [
      { name: 'Action' },
      { slug: 'school-life' },
      'Manhwa',
      'Truyện Hàn',
      ' Action '
    ]
  };

  assert.deepEqual(getSeriesTagNames(series), ['Action', 'school-life', 'Manhwa', 'Truyện Hàn', 'Action']);
  assert.deepEqual(getManualTagNames(series), ['Action', 'school-life', 'Action']);
});

test('admin tag merge replaces old origin tags and keeps unique manual tags', () => {
  assert.deepEqual(uniqueTagNames(['Action', ' action ', 'Đô Thị', 'do thi', '', 'Fantasy']), [
    'Action',
    'Đô Thị',
    'Fantasy'
  ]);

  assert.deepEqual(
    mergeTagsWithOrigin(['Action', 'Manhwa', 'Truyện Hàn', 'Fantasy'], 'manhua'),
    ['Action', 'Fantasy', 'Manhua', 'Truyện Trung']
  );
  assert.deepEqual(
    mergeTagsWithOrigin(['Action', 'Manhua', 'Truyện Trung'], ''),
    ['Action']
  );
});

test('admin origin tag options and picker render stable escaped radio controls', () => {
  const options = getOriginTagOptions();
  assert.deepEqual(options.map((option) => option.value), ['', 'manhwa', 'manhua']);

  const html = renderOriginTagPicker({
    tags: ['Fantasy', 'Truyện Hàn']
  });

  assert.match(html, /name="originType"/);
  assert.match(html, /value="manhwa" checked/);
  assert.match(html, /Truyện Hàn/);
  assert.match(html, /Truyện Trung/);
});
