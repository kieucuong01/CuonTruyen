import test from 'node:test';
import assert from 'node:assert/strict';

import { apiUrl, getRuntimeConfig } from '../public/runtimeConfig.mjs';

test('apiUrl keeps relative API paths when no public API host is configured', () => {
  assert.equal(apiUrl('/api/home', { apiBaseUrl: '' }), '/api/home');
});

test('apiUrl points API calls to the configured local machine host', () => {
  assert.equal(
    apiUrl('/api/home', { apiBaseUrl: 'https://comic-api.example.com/' }),
    'https://comic-api.example.com/api/home'
  );
});

test('getRuntimeConfig reads the browser global config safely', () => {
  const config = getRuntimeConfig({
    COMIC_READER_CONFIG: {
      apiBaseUrl: 'https://comic-api.example.com/'
    }
  });

  assert.equal(config.apiBaseUrl, 'https://comic-api.example.com/');
});
