import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

test('series cards use next/image with stable responsive cover sizing', () => {
  const source = fs.readFileSync('src/components/public/SeriesCard.tsx', 'utf8');

  assert.match(source, /from 'next\/image'/);
  assert.match(source, /<Image/);
  assert.match(source, /fill/);
  assert.match(source, /sizes=/);
  assert.match(source, /className="next-cover-image"/);
  assert.doesNotMatch(source, /<img\s/);
});

test('series detail cover is priority optimized but reader pages keep raw images', () => {
  const seriesPage = fs.readFileSync('src/app/truyen/[seriesSlug]/page.tsx', 'utf8');
  const readerPage = fs.readFileSync('src/app/truyen/[seriesSlug]/[chapterSlug]/page.tsx', 'utf8');
  const readerIsland = fs.readFileSync('src/components/reader/ReaderIsland.tsx', 'utf8');

  assert.match(seriesPage, /from 'next\/image'/);
  assert.match(seriesPage, /<Image/);
  assert.match(seriesPage, /priority/);
  assert.match(seriesPage, /sizes=/);
  assert.match(seriesPage, /className="next-hero-cover-image"/);

  assert.doesNotMatch(readerPage, /from 'next\/image'/);
  assert.match(readerPage, /ReaderIsland/);
  assert.doesNotMatch(readerIsland, /from 'next\/image'/);
  assert.match(readerIsland, /fetchPriority=\{chapterIndex === 0 && index === 0 \? 'high' : 'auto'\}/);
  assert.match(readerIsland, /loading=\{chapterIndex === 0 && index < 2 \? 'eager' : 'lazy'\}/);
});

test('public listing pages prioritize only above-the-fold cover cards', () => {
  const cardSource = fs.readFileSync('src/components/public/SeriesCard.tsx', 'utf8');
  const homeSource = fs.readFileSync('src/app/page.tsx', 'utf8');
  const tagSource = fs.readFileSync('src/app/the-loai/[tagSlug]/page.tsx', 'utf8');

  assert.match(cardSource, /priority\s*=\s*false/);
  assert.match(cardSource, /priority=\{priority\}/);
  assert.match(homeSource, /map\(\(series: any, index\)/);
  assert.match(homeSource, /priority=\{index < 2\}/);
  assert.match(tagSource, /map\(\(series: any, index\)/);
  assert.match(tagSource, /priority=\{index < 2\}/);
});

test('next image config allows the configured public imports host', async () => {
  const previousImportsBase = process.env.PUBLIC_IMPORTS_BASE_URL;
  process.env.PUBLIC_IMPORTS_BASE_URL = 'https://cdn.example.com/cuontruyen';
  try {
    const configUrl = `${pathToFileURL(resolve('next.config.mjs')).href}?imports-host=${Date.now()}`;
    const { default: config } = await import(configUrl);
    const hosts = config.images.remotePatterns.map((pattern) => `${pattern.protocol}://${pattern.hostname}`);

    assert.ok(hosts.includes('https://s3.vn-hcm-1.vietnix.cloud'));
    assert.ok(hosts.includes('https://cdn.example.com'));
  } finally {
    if (previousImportsBase === undefined) delete process.env.PUBLIC_IMPORTS_BASE_URL;
    else process.env.PUBLIC_IMPORTS_BASE_URL = previousImportsBase;
  }
});
