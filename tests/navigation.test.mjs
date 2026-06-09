import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldScrollToTopForRoute } from '../public/navigation.mjs';

test('series detail routes reset scroll to the top', () => {
  assert.equal(shouldScrollToTopForRoute({ pathname: '/truyen/sat-thu-peter' }), true);
  assert.equal(shouldScrollToTopForRoute({ pathname: '/the-loai/manhwa' }), true);
  assert.equal(shouldScrollToTopForRoute({ pathname: '/', hash: '' }), true);
});

test('reader routes keep their reading scroll position', () => {
  assert.equal(shouldScrollToTopForRoute({ pathname: '/truyen/sat-thu-peter/doc-tu-dau' }), false);
  assert.equal(shouldScrollToTopForRoute({ pathname: '/', hash: '#/read/sat-thu-peter-4g994p' }), false);
});
