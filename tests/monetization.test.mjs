import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeMonetizationConfig,
  shouldShowAds
} from '../public/monetization.mjs';

test('normalizeMonetizationConfig can turn ads and donate on or off', () => {
  assert.deepEqual(
    normalizeMonetizationConfig({ adsEnabled: false, donateUrl: 'https://example.test/donate' }),
    {
      adsEnabled: false,
      donateUrl: 'https://example.test/donate',
      adminNoAds: true
    }
  );
});

test('shouldShowAds respects disabled ads and admin routes', () => {
  assert.equal(shouldShowAds({ config: { adsEnabled: false } }), false);
  assert.equal(shouldShowAds({ route: '#/admin' }), false);
  assert.equal(shouldShowAds({ route: '/' }), true);
});
