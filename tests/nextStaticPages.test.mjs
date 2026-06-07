import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import * as staticPages from '../src/lib/server/static-pages.mjs';

test('nextStaticPageData exposes crawlable policy page metadata', () => {
  const page = staticPages.nextStaticPageData('/gioi-thieu');

  assert.equal(page?.path, '/gioi-thieu');
  assert.match(page?.title || '', /Cuộn Truyện/);
  assert.match(page?.description || '', /reader|đọc/i);
  assert.ok(Array.isArray(page?.items));
});

test('nextStaticPageData rejects unknown public static paths', () => {
  assert.equal(staticPages.nextStaticPageData('/khong-co'), null);
});

test('nextStaticPagePaths lists the static SEO pages owned by App Router', () => {
  assert.deepEqual(staticPages.nextStaticPagePaths().sort(), [
    '/chinh-sach-noi-dung',
    '/gioi-thieu',
    '/lien-he',
    '/privacy'
  ]);
});

test('next not-found page data is noindex and crawlable for users', () => {
  assert.equal(typeof staticPages.nextNotFoundPageData, 'function');
  const page = staticPages.nextNotFoundPageData();

  assert.match(page.title, /Không tìm thấy trang/);
  assert.match(page.description, /không tồn tại|đã được ẩn/i);
  assert.equal(page.noIndex, true);
  assert.ok(Array.isArray(page.items));
});

test('app router owns a custom noindex not-found page', () => {
  assert.equal(fs.existsSync('src/app/not-found.tsx'), true);
  const source = fs.readFileSync('src/app/not-found.tsx', 'utf8');

  assert.match(source, /nextNotFoundPageData/);
  assert.match(source, /StaticInfoPage/);
  assert.match(source, /robots/);
  assert.match(source, /index:\s*false/);
  assert.match(source, /follow:\s*false/);
});

test('static App Router SEO pages include Twitter metadata', () => {
  for (const routeFile of [
    'src/app/gioi-thieu/page.tsx',
    'src/app/lien-he/page.tsx',
    'src/app/chinh-sach-noi-dung/page.tsx',
    'src/app/privacy/page.tsx'
  ]) {
    const source = fs.readFileSync(routeFile, 'utf8');

    assert.match(source, /twitter:\s*\{/, `${routeFile} should expose twitter metadata`);
    assert.match(source, /card:\s*['"]summary['"]/, `${routeFile} should use a compact Twitter summary card`);
  }
});
