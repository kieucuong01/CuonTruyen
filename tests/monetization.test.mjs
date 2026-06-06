import test from 'node:test';
import assert from 'node:assert/strict';

import {
  adSlotForPlacement,
  hasRealAdSlot,
  normalizeMonetizationConfig,
  renderAdSlotHtml,
  shouldShowAds
} from '../public/monetization.mjs';

test('normalizeMonetizationConfig can turn ads and donate on or off', () => {
  assert.deepEqual(
    normalizeMonetizationConfig({ adsEnabled: false, donateUrl: 'https://example.test/donate' }),
    {
      adsEnabled: false,
      donateUrl: 'https://example.test/donate',
      adminNoAds: true,
      adsProvider: '',
      adsenseClient: '',
      adsenseSlots: {
        home: '',
        series: '',
        chapterEnd: ''
      },
      adsenseTestMode: false
    }
  );
});

test('shouldShowAds respects disabled ads and admin routes', () => {
  assert.equal(shouldShowAds({ config: { adsEnabled: false } }), false);
  assert.equal(shouldShowAds({ route: '#/admin' }), false);
  assert.equal(shouldShowAds({ route: '/' }), true);
});

test('AdSense config maps lightweight public ad placements', () => {
  const config = normalizeMonetizationConfig({
    adsenseClient: 'ca-pub-123',
    adsenseSlots: {
      home: '111',
      series: '222',
      chapterEnd: '333'
    },
    adsenseTestMode: true
  });

  assert.equal(config.adsProvider, 'adsense');
  assert.equal(adSlotForPlacement(config, 'home'), '111');
  assert.equal(adSlotForPlacement(config, 'series'), '222');
  assert.equal(adSlotForPlacement(config, 'chapter-end'), '333');
  assert.equal(hasRealAdSlot(config, 'chapter-end'), true);
});

test('renderAdSlotHtml only emits real ad markup when client and slot are configured', () => {
  assert.equal(renderAdSlotHtml({ config: {}, placement: 'home' }), '');

  const html = renderAdSlotHtml({
    config: {
      adsenseClient: 'ca-pub-123',
      adsenseSlots: { home: '111' }
    },
    placement: 'home',
    className: 'home-ad',
    label: 'Quảng cáo'
  });

  assert.match(html, /class="ad-slot adsense-slot home-ad"/);
  assert.match(html, /data-ad-placement="home"/);
  assert.match(html, /class="adsbygoogle"/);
  assert.match(html, /data-ad-client="ca-pub-123"/);
  assert.match(html, /data-ad-slot="111"/);
});
