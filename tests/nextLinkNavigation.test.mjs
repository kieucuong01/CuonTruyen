import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const nextNavigationFiles = [
  'src/app/page.tsx',
  'src/app/truyen/[seriesSlug]/page.tsx',
  'src/app/truyen/[seriesSlug]/[chapterSlug]/page.tsx',
  'src/app/the-loai/[tagSlug]/page.tsx',
  'src/components/public/ContinueIsland.tsx',
  'src/components/public/SeriesCard.tsx',
  'src/components/public/StaticInfoPage.tsx',
  'src/components/admin/AdminDashboardIsland.tsx',
  'src/components/admin/AdminSeriesEditorIsland.tsx'
];

test('Next route surfaces use next/link for internal navigation', () => {
  for (const file of nextNavigationFiles) {
    const source = fs.readFileSync(file, 'utf8');

    assert.match(source, /from 'next\/link'/, `${file} should import next/link`);
    assert.doesNotMatch(source, /<a\b/, `${file} should not render raw anchors for internal routes`);
    assert.match(source, /<Link\b/, `${file} should render Link for internal routes`);
  }
});

test('repeated dynamic Next links do not prefetch large catalogs by default', () => {
  for (const file of [
    'src/components/public/SeriesCard.tsx',
    'src/app/truyen/[seriesSlug]/page.tsx',
    'src/components/admin/AdminDashboardIsland.tsx',
    'src/components/admin/AdminSeriesEditorIsland.tsx'
  ]) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /prefetch=\{false\}/, `${file} should disable prefetch on repeated dynamic lists`);
  }
});

test('reader entry links do not prefetch chapter page payloads', () => {
  const seriesPage = fs.readFileSync('src/app/truyen/[seriesSlug]/page.tsx', 'utf8');
  const continueIsland = fs.readFileSync('src/components/public/ContinueIsland.tsx', 'utf8');

  assert.match(
    seriesPage,
    /<Link\s+[^>]*className="next-primary-link"[^>]*prefetch=\{false\}/s,
    'series detail reader CTA should not prefetch chapter page arrays'
  );
  assert.match(
    continueIsland,
    /<Link\s+[^>]*className="next-continue"[^>]*prefetch=\{false\}/s,
    'resume reader link should not prefetch chapter page arrays'
  );
});
