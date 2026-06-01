import test from 'node:test';
import assert from 'node:assert/strict';

import { createBoundedCache as createFrontendCache } from '../public/cacheStore.mjs';
import { createBoundedCache as createServerCache } from '../server/cacheStore.mjs';

test('bounded cache evicts the oldest entry after maxEntries', () => {
  const cache = createFrontendCache({ maxEntries: 2 });
  cache.set('a', 1);
  cache.set('b', 2);
  cache.set('c', 3);
  assert.equal(cache.get('a'), undefined);
  assert.equal(cache.get('b'), 2);
  assert.equal(cache.get('c'), 3);
});

test('server bounded cache refreshes recency on get', () => {
  const cache = createServerCache({ maxEntries: 2 });
  cache.set('a', 1);
  cache.set('b', 2);
  assert.equal(cache.get('a'), 1);
  cache.set('c', 3);
  assert.deepEqual(cache.keys(), ['a', 'c']);
});
