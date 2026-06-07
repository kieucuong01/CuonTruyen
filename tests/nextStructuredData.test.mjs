import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('homePageJsonLd emits compact WebSite and ItemList structured data', async () => {
  assert.equal(fs.existsSync('src/lib/server/next-json-ld.mjs'), true);
  const { homePageJsonLd } = await import('../src/lib/server/next-json-ld.mjs');
  const payload = homePageJsonLd({
    updated: [
      {
        title: 'Series A',
        slug: 'series-a',
        chapters: [{ id: 'c1', pages: [{ imageUrl: '/imports/a.jpg' }] }]
      }
    ],
    popular: [{ title: 'Series B', slug: 'series-b' }]
  }, 'https://example.com');

  assert.equal(payload['@type'], 'WebSite');
  assert.equal(payload.url, 'https://example.com/');
  assert.equal(payload.potentialAction['@type'], 'SearchAction');
  assert.equal(payload.mainEntity['@type'], 'ItemList');
  assert.equal(payload.mainEntity.itemListElement[0].url, 'https://example.com/truyen/series-a');
  assert.equal(JSON.stringify(payload).includes('pages'), false);
});

test('breadcrumbJsonLd emits compact absolute breadcrumb items', async () => {
  const { breadcrumbJsonLd } = await import('../src/lib/server/next-json-ld.mjs');
  const payload = breadcrumbJsonLd([
    { name: 'Cuộn Truyện', path: '/' },
    { name: 'Demo Story', path: '/truyen/demo-story' },
    { name: 'Chương 1', path: '/truyen/demo-story/chuong-1' }
  ], 'https://example.com/');

  assert.equal(payload['@context'], 'https://schema.org');
  assert.equal(payload['@type'], 'BreadcrumbList');
  assert.deepEqual(payload.itemListElement.map((item) => item.position), [1, 2, 3]);
  assert.equal(payload.itemListElement[0].item, 'https://example.com/');
  assert.equal(payload.itemListElement[2].item, 'https://example.com/truyen/demo-story/chuong-1');
  assert.equal(JSON.stringify(payload).includes('pages'), false);
});

test('breadcrumbJsonLd skips entries without crawlable names or paths', async () => {
  const { breadcrumbJsonLd } = await import('../src/lib/server/next-json-ld.mjs');
  const payload = breadcrumbJsonLd([
    { name: 'Cuộn Truyện', path: '/' },
    { name: '', path: '/missing-name' },
    { name: 'Missing path', path: '' },
    { name: 'Tag', path: '/the-loai/action' }
  ], 'https://example.com');

  assert.deepEqual(payload.itemListElement.map((item) => item.name), ['Cuộn Truyện', 'Tag']);
  assert.deepEqual(payload.itemListElement.map((item) => item.position), [1, 2]);
});

test('staticPageJsonLd emits compact WebPage structured data', async () => {
  const { staticPageJsonLd } = await import('../src/lib/server/next-json-ld.mjs');
  assert.equal(typeof staticPageJsonLd, 'function');

  const payload = staticPageJsonLd({
    title: 'Giới thiệu Cuộn Truyện',
    description: 'Trang giới thiệu reader Cuộn Truyện.',
    path: '/gioi-thieu',
    body: 'Long page copy',
    items: ['one', 'two']
  }, 'https://example.com/');

  assert.equal(payload['@context'], 'https://schema.org');
  assert.equal(payload['@type'], 'WebPage');
  assert.equal(payload.name, 'Giới thiệu Cuộn Truyện');
  assert.equal(payload.description, 'Trang giới thiệu reader Cuộn Truyện.');
  assert.equal(payload.url, 'https://example.com/gioi-thieu');
  assert.equal(payload.isPartOf['@type'], 'WebSite');
  assert.equal(payload.isPartOf.url, 'https://example.com/');
  assert.equal(JSON.stringify(payload).includes('items'), false);
  assert.equal(JSON.stringify(payload).includes('Long page copy'), false);
});

test('JsonLd component emits escaped application/ld+json scripts', () => {
  assert.equal(fs.existsSync('src/components/seo/JsonLd.tsx'), true);
  const source = fs.readFileSync('src/components/seo/JsonLd.tsx', 'utf8');

  assert.match(source, /type="application\/ld\+json"/);
  assert.match(source, /dangerouslySetInnerHTML/);
  assert.match(source, /replace\(\s*\/<\//);
});

test('Next public SEO pages render route-specific structured data', () => {
  const expectations = [
    ['src/app/page.tsx', /homePageJsonLd/, /<JsonLd data=\{jsonLd\}/, false],
    ['src/app/truyen/[seriesSlug]/page.tsx', /seriesJsonLd/, /<JsonLd data=\{jsonLd\}/, true],
    ['src/app/truyen/[seriesSlug]/[chapterSlug]/page.tsx', /chapterJsonLd/, /<JsonLd data=\{jsonLd\}/, true],
    ['src/app/the-loai/[tagSlug]/page.tsx', /tagPageJsonLd/, /<JsonLd data=\{jsonLd\}/, true]
  ];

  for (const [file, helperPattern, renderPattern, needsBreadcrumb] of expectations) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /JsonLd/, `${file} should import the JSON-LD component`);
    assert.match(source, helperPattern, `${file} should use the route-specific schema helper`);
    assert.match(source, renderPattern, `${file} should render the schema payload`);
    if (needsBreadcrumb) {
      assert.match(source, /breadcrumbJsonLd/, `${file} should include breadcrumb structured data`);
      assert.match(source, /const jsonLd = \[/, `${file} should render route schema and breadcrumb together`);
    }
  }
});

test('static App Router SEO pages render WebPage structured data', () => {
  for (const routeFile of [
    'src/app/gioi-thieu/page.tsx',
    'src/app/lien-he/page.tsx',
    'src/app/chinh-sach-noi-dung/page.tsx',
    'src/app/privacy/page.tsx'
  ]) {
    const source = fs.readFileSync(routeFile, 'utf8');

    assert.match(source, /staticPageJsonLd/, `${routeFile} should use static WebPage schema`);
    assert.match(source, /const jsonLd = staticPageJsonLd/, `${routeFile} should create static page schema`);
    assert.match(source, /<StaticInfoPage page=\{page\} jsonLd=\{jsonLd\}/, `${routeFile} should render static page schema`);
  }
});
