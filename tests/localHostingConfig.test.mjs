import test from 'node:test';
import assert from 'node:assert/strict';

import { publicImportPath } from '../server/catalogStore.mjs';
import { corsHeaders } from '../server/utils.mjs';

test('publicImportPath can emit absolute URLs for a public local image host', () => {
  const previousBaseUrl = process.env.PUBLIC_IMPORTS_BASE_URL;
  const previousEnabled = process.env.PUBLIC_IMPORTS_BASE_URL_ENABLED;
  process.env.PUBLIC_IMPORTS_BASE_URL = 'https://comic-api.example.com/';
  process.env.PUBLIC_IMPORTS_BASE_URL_ENABLED = 'true';

  try {
    assert.equal(
      publicImportPath('series 1', 'chapter 1', '001.jpg'),
      'https://comic-api.example.com/imports/series%201/chapter%201/001.jpg'
    );
  } finally {
    if (previousBaseUrl === undefined) delete process.env.PUBLIC_IMPORTS_BASE_URL;
    else process.env.PUBLIC_IMPORTS_BASE_URL = previousBaseUrl;
    if (previousEnabled === undefined) delete process.env.PUBLIC_IMPORTS_BASE_URL_ENABLED;
    else process.env.PUBLIC_IMPORTS_BASE_URL_ENABLED = previousEnabled;
  }
});

test('CORS headers can be narrowed to the deployed frontend origin', () => {
  const previousOrigin = process.env.CORS_ALLOW_ORIGIN;
  process.env.CORS_ALLOW_ORIGIN = 'https://comic.example.com';

  try {
    assert.equal(corsHeaders()['access-control-allow-origin'], 'https://comic.example.com');
    assert.match(corsHeaders()['access-control-allow-methods'], /OPTIONS/);
  } finally {
    if (previousOrigin === undefined) delete process.env.CORS_ALLOW_ORIGIN;
    else process.env.CORS_ALLOW_ORIGIN = previousOrigin;
  }
});
