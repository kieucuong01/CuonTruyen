import test from 'node:test';
import assert from 'node:assert/strict';

import { hasReadableChapter } from '../public/chapterState.mjs';

test('hasReadableChapter trusts real page arrays before stale counters', () => {
  assert.equal(hasReadableChapter({ pages: [{ imageUrl: '/imports/demo/001.jpg' }], imported: false, pageCount: 0 }), true);
  assert.equal(hasReadableChapter({ pages: [], imported: true, pageCount: 20 }), false);
});

test('hasReadableChapter requires imported summary state with a positive page count', () => {
  assert.equal(hasReadableChapter({ imported: true, pageCount: 12 }), true);
  assert.equal(hasReadableChapter({ imported: false, pageCount: 12 }), false);
});
