import test from 'node:test';
import assert from 'node:assert/strict';

import {
  findExistingSeriesForImport,
  sourceIdentityKey,
  sourceMappingsWith
} from '../server/importer.mjs';

test('sourceIdentityKey matches TruyenQQ mirror URLs by path', () => {
  assert.equal(
    sourceIdentityKey('https://truyenqqko.com/truyen-tranh/gacha-vo-han-13496'),
    sourceIdentityKey('https://truyenqqgo.com/truyen-tranh/gacha-vo-han-13496/')
  );
});

test('findExistingSeriesForImport reuses an existing series across mirror hostnames', () => {
  const existing = {
    id: 'gacha-vo-han-existing',
    slug: 'gacha-vo-han',
    sourceMappings: [
      { adapter: 'truyenqq', sourceUrl: 'https://truyenqqko.com/truyen-tranh/gacha-vo-han-13496' }
    ]
  };

  assert.equal(
    findExistingSeriesForImport(
      { series: [existing] },
      { slug: 'other-slug', title: 'Gacha Vô Hạn' },
      'https://truyenqqgo.com/truyen-tranh/gacha-vo-han-13496'
    ),
    existing
  );
});

test('sourceMappingsWith preserves existing mappings and adds the active source once', () => {
  const mappings = sourceMappingsWith({
    adapter: 'truyenqq',
    sourceUrl: 'https://truyenqqko.com/truyen-tranh/gacha-vo-han-13496',
    sourceMappings: [
      { adapter: 'truyenqq', sourceUrl: 'https://truyenqqko.com/truyen-tranh/gacha-vo-han-13496' }
    ]
  }, 'truyenqq', 'https://truyenqqgo.com/truyen-tranh/gacha-vo-han-13496');

  assert.deepEqual(mappings, [
    { adapter: 'truyenqq', sourceUrl: 'https://truyenqqko.com/truyen-tranh/gacha-vo-han-13496' },
    { adapter: 'truyenqq', sourceUrl: 'https://truyenqqgo.com/truyen-tranh/gacha-vo-han-13496' }
  ]);
});
