import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bindAdminImageFallbacks,
  findAdminSeries,
  handleAdminCoverError,
  isAdminAuthError
} from '../public/routes/adminDomHelpers.mjs';

function createCoverImage({ fallbackSrc = '', src = '/broken.webp' } = {}) {
  const calls = [];
  const cover = {
    classList: {
      add(className) {
        calls.push(['cover.add', className]);
      }
    }
  };
  const image = {
    calls,
    dataset: { fallbackSrc },
    src,
    getAttribute(name) {
      if (name === 'src') return this.src;
      return '';
    },
    removeAttribute(name) {
      calls.push(['removeAttribute', name]);
      delete this.dataset.fallbackSrc;
    },
    closest(selector) {
      calls.push(['closest', selector]);
      return cover;
    },
    remove() {
      calls.push(['remove']);
    }
  };
  return image;
}

test('admin cover error swaps to fallback once before marking the cover missing', () => {
  const image = createCoverImage({ fallbackSrc: '/fallback.webp', src: '/broken.webp' });

  handleAdminCoverError({ currentTarget: image });

  assert.equal(image.src, '/fallback.webp');
  assert.deepEqual(image.calls, [['removeAttribute', 'data-fallback-src']]);

  handleAdminCoverError({ currentTarget: image });
  assert.deepEqual(image.calls.slice(1), [
    ['closest', '.admin-series-cover'],
    ['cover.add', 'is-missing'],
    ['remove']
  ]);
});

test('bindAdminImageFallbacks attaches error listeners to admin cover images', () => {
  const listeners = [];
  const images = [
    { addEventListener: (...args) => listeners.push(args) },
    { addEventListener: (...args) => listeners.push(args) }
  ];
  const app = {
    querySelectorAll(selector) {
      assert.equal(selector, '[data-admin-cover-img]');
      return images;
    }
  };

  bindAdminImageFallbacks(app);

  assert.equal(listeners.length, 2);
  assert.equal(listeners[0][0], 'error');
  assert.equal(listeners[0][1], handleAdminCoverError);
  assert.deepEqual(listeners[0][2], { once: false });
});

test('admin route helpers find series by id or slug and detect auth failures', () => {
  const catalog = {
    series: [
      { id: 's1', slug: 'alpha' },
      { id: 's2', slug: 'beta' }
    ]
  };

  assert.equal(findAdminSeries(catalog, 's1')?.slug, 'alpha');
  assert.equal(findAdminSeries(catalog, 'beta')?.id, 's2');
  assert.equal(findAdminSeries(catalog, 'missing'), null);
  assert.equal(isAdminAuthError(new Error('Admin token is required')), true);
  assert.equal(isAdminAuthError(new Error('request failed with 401')), true);
  assert.equal(isAdminAuthError(new Error('network timeout')), false);
});
