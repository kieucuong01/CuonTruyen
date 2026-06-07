# Next.js Layered Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Next.js App Router layer for the public SEO routes `/`, `/truyen/:slug`, `/truyen/:slug/:chapter`, and `/the-loai/:slug` while keeping the current SPA/admin/API/worker flows available.

**Architecture:** Introduce Next.js beside the current Node/vanilla app. Server Components render crawlable public HTML using existing catalog/content/SEO helpers through a small server data adapter. Browser-only behavior such as "Đọc tiếp" and the reader runtime lives in client islands that initially call the existing public APIs.

**Tech Stack:** Next.js App Router, React, TypeScript, existing Node ESM server modules, PostgreSQL facade, Vietnix S3 image URL rewriting, Node test runner.

---

## File Structure

- Create `next.config.mjs`: minimal Next config with ESM, external package handling, and local compatibility.
- Create `tsconfig.json`: TypeScript config generated/compatible with Next.
- Create `next-env.d.ts`: Next type declarations.
- Create `src/app/layout.tsx`: root HTML shell and global stylesheet import.
- Create `src/app/globals.css`: small public-route CSS that does not depend on the old SPA bundle.
- Create `src/app/page.tsx`: server-rendered home route.
- Create `src/app/truyen/[seriesSlug]/page.tsx`: server-rendered series detail route.
- Create `src/app/truyen/[seriesSlug]/[chapterSlug]/page.tsx`: server-rendered reader shell route.
- Create `src/app/the-loai/[tagSlug]/page.tsx`: server-rendered tag route.
- Create `src/components/public/ContinueIsland.tsx`: client island for "Đọc tiếp" localStorage lookup.
- Create `src/components/reader/ReaderIsland.tsx`: client island scaffold that consumes initial chapter data and can fetch adjacent chapters.
- Create `src/lib/server/public-data.mjs`: server data adapter around `server/dataStore.mjs`, `server/contentStore.mjs`, and `server/seo.mjs`. Keep this as `.mjs` in Phase 1 so existing Node tests can import it directly.
- Create `src/lib/shared/urls.ts`: URL and image helpers safe for server/client use.
- Modify `package.json`: add `dev:next`, `build:next`, and dependencies.
- Modify `docs/agent-playbooks/current-deployment.md`: document the transitional Next dev command.
- Add tests under `tests/nextPublicData.test.mjs` for public filtering and data helpers.

## Task 1: Install Next.js Dependencies And Scripts

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `next.config.mjs`
- Create: `tsconfig.json`
- Create: `next-env.d.ts`

- [ ] **Step 1: Add dependencies**

Run:

```powershell
npm install next@latest react@latest react-dom@latest typescript@latest @types/react@latest @types/react-dom@latest --save
```

Expected: `package.json` and `package-lock.json` include Next, React, React DOM, TypeScript, and React types.

- [ ] **Step 2: Add package scripts**

Update `package.json` scripts without removing existing crawler/publish scripts:

```json
{
  "dev:next": "next dev --hostname 0.0.0.0",
  "build:next": "next build",
  "start:next": "next start"
}
```

Expected: `npm run dev` still starts the current app; `npm run dev:next` starts Next for Phase 1.

- [ ] **Step 3: Create `next.config.mjs`**

Create:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['pg', 'sharp'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 's3.vn-hcm-1.vietnix.cloud'
      },
      {
        protocol: 'https',
        hostname: 'truyenqqko.com'
      }
    ]
  }
};

export default nextConfig;
```

- [ ] **Step 4: Create TypeScript config**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2022"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": false,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "data", "logs", ".runtime"]
}
```

Create `next-env.d.ts`:

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

- [ ] **Step 5: Verify install baseline**

Run:

```powershell
npm run build:next
```

Expected before routes exist: Next build either succeeds with the default app files after Task 2, or fails with a clear missing app/layout message that Task 2 resolves.

## Task 2: Add Root App Shell And Styling

**Files:**
- Create: `src/app/layout.tsx`
- Create: `src/app/globals.css`
- Create: `src/lib/shared/urls.ts`

- [ ] **Step 1: Create URL helpers**

Create `src/lib/shared/urls.ts`:

```ts
export function siteBaseUrl() {
  return (process.env.PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://cuontruyen.vercel.app').replace(/\/+$/, '');
}

export function absoluteSiteUrl(pathname = '/') {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${siteBaseUrl()}${path}`;
}

export function publicImageUrl(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const importsBase = String(process.env.PUBLIC_IMPORTS_BASE_URL || '').replace(/\/+$/, '');
  if (importsBase && raw.startsWith('/imports/')) return `${importsBase}${raw}`;
  return raw;
}
```

- [ ] **Step 2: Create root layout**

Create `src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.PUBLIC_SITE_URL || 'https://cuontruyen.vercel.app'),
  title: {
    default: 'Cuộn Truyện - Đọc truyện tranh liền mạch',
    template: '%s | Cuộn Truyện'
  },
  description: 'Đọc truyện tranh manhwa, manhua, manga online liền mạch, tự lưu vị trí và mở lại đúng chương đang đọc.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Create public CSS**

Create `src/app/globals.css` with minimal public-route styling:

```css
:root {
  color-scheme: light;
  --bg: #fff8f0;
  --panel: #ffffff;
  --text: #241610;
  --muted: #7b6254;
  --accent: #f36f21;
  --line: rgba(83, 51, 31, 0.16);
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

a {
  color: inherit;
  text-decoration: none;
}

.next-shell {
  width: min(1180px, calc(100% - 32px));
  margin: 0 auto;
  padding: 24px 0 56px;
}

.next-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 0 24px;
}

.next-brand {
  font-weight: 800;
  font-size: 20px;
}

.next-muted {
  color: var(--muted);
}

.next-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 16px;
}

.next-card {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  overflow: hidden;
}

.next-card img {
  display: block;
  width: 100%;
  aspect-ratio: 3 / 4;
  object-fit: cover;
}

.next-card-copy {
  padding: 12px;
}

.next-hero {
  display: grid;
  grid-template-columns: minmax(0, 240px) minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}

.next-reader-page img {
  display: block;
  width: min(100%, 900px);
  height: auto;
  margin: 0 auto;
}

@media (max-width: 720px) {
  .next-shell {
    width: min(100% - 20px, 680px);
    padding-top: 12px;
  }

  .next-hero {
    grid-template-columns: 112px minmax(0, 1fr);
    gap: 14px;
  }
}
```

- [ ] **Step 4: Run syntax/build check**

Run:

```powershell
npm run build:next
```

Expected: build succeeds once root page exists in Task 4, or reports the next missing route file before that task.

## Task 3: Add Server Public Data Adapter

**Files:**
- Create: `src/lib/server/public-data.mjs`
- Test: `tests/nextPublicData.test.mjs`

- [ ] **Step 1: Create failing tests**

Create `tests/nextPublicData.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  nextPublicHomeData,
  nextPublicSeriesData,
  nextPublicTagData
} from '../src/lib/server/public-data.mjs';

test('next public data excludes draft and removed content', async () => {
  const catalog = {
    series: [
      {
        id: 'public-1',
        title: 'Public Story',
        slug: 'public-story',
        status: 'public',
        tags: [{ name: 'Action', slug: 'action' }],
        chapters: [
          { id: 'c1', title: 'Chapter 1', slug: 'chapter-1', status: 'public', imported: true, pages: [{ imageUrl: '/imports/a/1.jpg' }] },
          { id: 'c2', title: 'Draft Chapter', slug: 'draft-chapter', status: 'draft', imported: true, pages: [{ imageUrl: '/imports/a/2.jpg' }] }
        ]
      },
      {
        id: 'draft-1',
        title: 'Draft Story',
        slug: 'draft-story',
        status: 'draft',
        tags: [{ name: 'Action', slug: 'action' }],
        chapters: []
      }
    ]
  };

  const home = await nextPublicHomeData({ catalog });
  assert.deepEqual(home.updated.map((item) => item.slug), ['public-story']);

  const series = await nextPublicSeriesData('public-story', { catalog });
  assert.equal(series?.chapters.length, 1);
  assert.equal(series?.chapters[0].slug, 'chapter-1');

  const tag = await nextPublicTagData('action', { catalog });
  assert.deepEqual(tag?.series.map((item) => item.slug), ['public-story']);
});
```

Run:

```powershell
node --require ./tests/setup-env.cjs --test tests/nextPublicData.test.mjs
```

Expected: FAIL because `src/lib/server/public-data.mjs` does not exist yet.

- [ ] **Step 2: Implement server adapter**

Create `src/lib/server/public-data.mjs`:

```js
import {
  buildHomeCollections,
  buildReaderChapterPayload,
  buildTagPage,
  publicCatalog,
  publicSeriesDetail,
  findSeriesBySlug
} from '../../../server/contentStore.mjs';
import { readCatalog } from '../../../server/dataStore.mjs';
import { tagSeoCopy } from '../../../server/seo.mjs';

async function resolveCatalog(options = {}) {
  return options.catalog || await readCatalog({ includePages: true });
}

export async function nextPublicHomeData(options = {}) {
  const catalog = await resolveCatalog(options);
  const home = buildHomeCollections(catalog);
  const list = publicCatalog(catalog).series || [];
  return {
    ...home,
    popular: home.hot || list.slice(0, 12),
    updated: home.updated || list.slice(0, 24),
    tags: home.tags || []
  };
}

export async function nextPublicSeriesData(seriesSlug, options = {}) {
  const catalog = await resolveCatalog(options);
  const series = findSeriesBySlug(catalog, seriesSlug);
  if (!series) return null;
  return publicSeriesDetail(series);
}

export async function nextPublicReaderData(seriesSlug, chapterSlug, options = {}) {
  const catalog = await resolveCatalog(options);
  return buildReaderChapterPayload(catalog, seriesSlug, chapterSlug, { window: 1 });
}

export async function nextPublicTagData(tagSlug, options = {}) {
  const catalog = await resolveCatalog(options);
  const page = buildTagPage(catalog, tagSlug);
  if (!page) return null;
  const seo = tagSeoCopy(page.tag);
  return {
    ...page,
    slug: page.tag.slug,
    title: seo.title,
    description: seo.description
  };
}
```

- [ ] **Step 3: Run test**

Run:

```powershell
node --require ./tests/setup-env.cjs --test tests/nextPublicData.test.mjs
```

Expected: PASS.

## Task 4: Implement Home Route

**Files:**
- Create: `src/app/page.tsx`
- Create: `src/components/public/SeriesCard.tsx`
- Create: `src/components/public/ContinueIsland.tsx`

- [ ] **Step 1: Create shared card component**

Create `src/components/public/SeriesCard.tsx`:

```tsx
import Link from 'next/link';
import { publicImageUrl } from '@/lib/shared/urls';

export function SeriesCard({ series }: { series: any }) {
  const href = series?.slug ? `/truyen/${encodeURIComponent(series.slug)}` : '#';
  const cover = publicImageUrl(series?.thumbnailUrl || series?.coverUrl || series?.coverThumbnail?.url);
  return (
    <article className="next-card">
      <Link href={href}>
        {cover ? <img src={cover} alt={series.title || 'Truyện'} loading="lazy" decoding="async" /> : null}
        <div className="next-card-copy">
          <strong>{series.title || 'Truyện chưa đặt tên'}</strong>
          <p className="next-muted">{Number(series.chapterCount || 0).toLocaleString('vi-VN')} chương</p>
        </div>
      </Link>
    </article>
  );
}
```

- [ ] **Step 2: Create continue island**

Create `src/components/public/ContinueIsland.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';

type ProgressItem = {
  seriesId?: string;
  seriesSlug?: string;
  chapterSlug?: string;
  chapterId?: string;
  updatedAt?: string;
};

export function ContinueIsland({ seriesSlug }: { seriesSlug?: string }) {
  const [href, setHref] = useState('');

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('comic-reader-progress');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const values: ProgressItem[] = Array.isArray(parsed) ? parsed : Object.values(parsed || {});
      const match = values.find((item) => !seriesSlug || item.seriesSlug === seriesSlug);
      if (!match?.seriesSlug) return;
      const chapter = match.chapterSlug || match.chapterId || '';
      setHref(chapter ? `/truyen/${match.seriesSlug}/${chapter}` : `/truyen/${match.seriesSlug}`);
    } catch {
      setHref('');
    }
  }, [seriesSlug]);

  if (!href) return null;
  return <a className="next-continue" href={href}>Đọc tiếp</a>;
}
```

- [ ] **Step 3: Create home page**

Create `src/app/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { ContinueIsland } from '@/components/public/ContinueIsland';
import { SeriesCard } from '@/components/public/SeriesCard';
import { nextPublicHomeData } from '@/lib/server/public-data';
import { absoluteSiteUrl } from '@/lib/shared/urls';

export const metadata: Metadata = {
  alternates: { canonical: absoluteSiteUrl('/') },
  openGraph: {
    title: 'Cuộn Truyện - Đọc truyện tranh liền mạch',
    description: 'Đọc truyện tranh manhwa, manhua, manga online liền mạch, tự lưu vị trí và mở lại đúng chương đang đọc.',
    url: absoluteSiteUrl('/')
  }
};

export default async function HomePage() {
  const home = await nextPublicHomeData();
  const updated = home.updated || [];
  const popular = home.popular || [];

  return (
    <main className="next-shell">
      <header className="next-topbar">
        <a className="next-brand" href="/">Cuộn Truyện</a>
        <ContinueIsland />
      </header>

      <section>
        <p className="next-muted">Đọc liền mạch, tự lưu tiến độ, mở lại đúng chương đang đọc.</p>
        <h1>Truyện mới cập nhật</h1>
        <div className="next-grid">
          {updated.slice(0, 24).map((series: any) => <SeriesCard key={series.id || series.slug} series={series} />)}
        </div>
      </section>

      <section>
        <h2>Đang được đọc nhiều</h2>
        <div className="next-grid">
          {popular.slice(0, 12).map((series: any) => <SeriesCard key={series.id || series.slug} series={series} />)}
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Verify route**

Run:

```powershell
npm run build:next
```

Expected: Next compiles home route.

## Task 5: Implement Series Detail Route

**Files:**
- Create: `src/app/truyen/[seriesSlug]/page.tsx`

- [ ] **Step 1: Create series page**

Create `src/app/truyen/[seriesSlug]/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ContinueIsland } from '@/components/public/ContinueIsland';
import { nextPublicSeriesData } from '@/lib/server/public-data';
import { absoluteSiteUrl, publicImageUrl } from '@/lib/shared/urls';

export async function generateMetadata({ params }: { params: Promise<{ seriesSlug: string }> }): Promise<Metadata> {
  const { seriesSlug } = await params;
  const series = await nextPublicSeriesData(seriesSlug);
  if (!series) return {};
  const url = absoluteSiteUrl(`/truyen/${series.slug}`);
  const image = publicImageUrl(series.thumbnailUrl || series.coverUrl || series.coverThumbnail?.url);
  return {
    title: `${series.title} - Đọc truyện tranh`,
    description: series.description || `Đọc ${series.title} liền mạch tại Cuộn Truyện, tự lưu vị trí và mở lại đúng chương đang đọc.`,
    alternates: { canonical: url },
    openGraph: {
      title: `${series.title} - Đọc truyện tranh`,
      description: series.description || `Đọc ${series.title} tại Cuộn Truyện.`,
      url,
      images: image ? [{ url: image }] : []
    }
  };
}

export default async function SeriesPage({ params }: { params: Promise<{ seriesSlug: string }> }) {
  const { seriesSlug } = await params;
  const series = await nextPublicSeriesData(seriesSlug);
  if (!series) notFound();
  const cover = publicImageUrl(series.thumbnailUrl || series.coverUrl || series.coverThumbnail?.url);

  return (
    <main className="next-shell">
      <header className="next-topbar">
        <a className="next-brand" href="/">Cuộn Truyện</a>
        <ContinueIsland seriesSlug={series.slug} />
      </header>
      <section className="next-hero">
        {cover ? <img className="next-card" src={cover} alt={series.title} loading="eager" decoding="async" /> : null}
        <div>
          <h1>{series.title}</h1>
          <p className="next-muted">{series.description || 'Đọc liền mạch, tự lưu vị trí và mở lại đúng chương đang đọc.'}</p>
          <p>{(series.tags || []).map((tag: any) => tag.name).join(' · ')}</p>
        </div>
      </section>
      <section>
        <h2>Danh sách chương</h2>
        <div>
          {(series.chapters || []).map((chapter: any) => (
            <p key={chapter.id}>
              <a href={`/truyen/${series.slug}/${chapter.slug || chapter.id}`}>{chapter.title || chapter.label || 'Chương'}</a>
            </p>
          ))}
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Verify route**

Run:

```powershell
npm run build:next
```

Expected: series route compiles and does not import client-only modules into Server Components.

## Task 6: Implement Reader Route And Client Island Scaffold

**Files:**
- Create: `src/app/truyen/[seriesSlug]/[chapterSlug]/page.tsx`
- Create: `src/components/reader/ReaderIsland.tsx`

- [ ] **Step 1: Create reader island**

Create `src/components/reader/ReaderIsland.tsx`:

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';

export function ReaderIsland({ initialPayload }: { initialPayload: any }) {
  const [payload, setPayload] = useState(initialPayload);
  const pages = useMemo(() => payload?.chapter?.pages || [], [payload]);

  useEffect(() => {
    const seriesSlug = payload?.series?.slug;
    const chapterSlug = payload?.chapter?.slug || payload?.chapter?.id;
    if (!seriesSlug || !chapterSlug) return;
    try {
      const key = 'comic-reader-progress';
      const current = JSON.parse(window.localStorage.getItem(key) || '{}');
      current[payload.series.id || seriesSlug] = {
        seriesId: payload.series.id,
        seriesSlug,
        chapterId: payload.chapter.id,
        chapterSlug,
        updatedAt: new Date().toISOString()
      };
      window.localStorage.setItem(key, JSON.stringify(current));
    } catch {
      // Local storage can be blocked in private/restricted contexts.
    }
  }, [payload]);

  return (
    <section className="next-reader" data-reader-series={payload?.series?.id || ''}>
      <div className="next-reader-page">
        {pages.map((page: any, index: number) => {
          const src = Array.isArray(page) ? page[1] : page.imageUrl || page.url || page.src;
          if (!src) return null;
          return <img key={`${src}-${index}`} src={src} alt={`${payload?.chapter?.title || 'Trang'} ${index + 1}`} loading={index < 2 ? 'eager' : 'lazy'} decoding="async" />;
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Create reader page**

Create `src/app/truyen/[seriesSlug]/[chapterSlug]/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ReaderIsland } from '@/components/reader/ReaderIsland';
import { nextPublicReaderData } from '@/lib/server/public-data';
import { absoluteSiteUrl, publicImageUrl } from '@/lib/shared/urls';

export async function generateMetadata({ params }: { params: Promise<{ seriesSlug: string; chapterSlug: string }> }): Promise<Metadata> {
  const { seriesSlug, chapterSlug } = await params;
  const payload = await nextPublicReaderData(seriesSlug, chapterSlug);
  if (!payload) return {};
  const title = `${payload.series.title} - ${payload.chapter.title || payload.chapter.label}`;
  const url = absoluteSiteUrl(`/truyen/${payload.series.slug}/${payload.chapter.slug || payload.chapter.id}`);
  const firstPage = payload.chapter.pages?.[0];
  const image = publicImageUrl(Array.isArray(firstPage) ? firstPage[1] : firstPage?.imageUrl || payload.series.thumbnailUrl || payload.series.coverUrl);
  return {
    title,
    description: `Đọc ${title} online tại Cuộn Truyện với reader nối chương liền mạch và lưu vị trí đọc.`,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: `Đọc ${title} tại Cuộn Truyện.`,
      url,
      images: image ? [{ url: image }] : []
    }
  };
}

export default async function ReaderPage({ params }: { params: Promise<{ seriesSlug: string; chapterSlug: string }> }) {
  const { seriesSlug, chapterSlug } = await params;
  const payload = await nextPublicReaderData(seriesSlug, chapterSlug);
  if (!payload) notFound();

  return (
    <main className="next-shell">
      <header className="next-topbar">
        <a className="next-brand" href={`/truyen/${payload.series.slug}`}>{payload.series.title}</a>
        <span className="next-muted">{payload.chapter.title || payload.chapter.label}</span>
      </header>
      <h1>{payload.chapter.title || payload.chapter.label}</h1>
      <ReaderIsland initialPayload={payload} />
    </main>
  );
}
```

- [ ] **Step 3: Verify reader route**

Run:

```powershell
npm run build:next
```

Expected: reader route compiles. Full continuous scroll parity is not complete until the follow-up reader-runtime task ports existing observer/windowing helpers.

## Task 7: Implement Tag Route

**Files:**
- Create: `src/app/the-loai/[tagSlug]/page.tsx`

- [ ] **Step 1: Create tag page**

Create `src/app/the-loai/[tagSlug]/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SeriesCard } from '@/components/public/SeriesCard';
import { nextPublicTagData } from '@/lib/server/public-data';
import { absoluteSiteUrl } from '@/lib/shared/urls';

export async function generateMetadata({ params }: { params: Promise<{ tagSlug: string }> }): Promise<Metadata> {
  const { tagSlug } = await params;
  const page = await nextPublicTagData(tagSlug);
  if (!page) return {};
  const title = page.title || `Thể loại ${tagSlug}`;
  const description = page.description || `Đọc truyện ${title} tại Cuộn Truyện.`;
  const url = absoluteSiteUrl(`/the-loai/${page.slug || tagSlug}`);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url }
  };
}

export default async function TagPage({ params }: { params: Promise<{ tagSlug: string }> }) {
  const { tagSlug } = await params;
  const page = await nextPublicTagData(tagSlug);
  if (!page) notFound();
  const seriesList = page.series || [];

  return (
    <main className="next-shell">
      <header className="next-topbar">
        <a className="next-brand" href="/">Cuộn Truyện</a>
      </header>
      <h1>{page.title || 'Thể loại truyện'}</h1>
      <p className="next-muted">{page.description || page.body || 'Khám phá truyện tranh theo thể loại.'}</p>
      <div className="next-grid">
        {seriesList.map((series: any) => <SeriesCard key={series.id || series.slug} series={series} />)}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify tag route**

Run:

```powershell
npm run build:next
```

Expected: tag route compiles and uses public-only series from the adapter.

## Task 8: Document Transition And Verify

**Files:**
- Modify: `docs/agent-playbooks/current-deployment.md`
- Modify: `docs/agent-playbooks/frontend-map.md`

- [ ] **Step 1: Document transitional commands**

Add to `docs/agent-playbooks/current-deployment.md`:

```markdown
## Next.js Layered Migration

The branch `nextjs-layered-app-router` introduces Next.js App Router public SEO routes in parallel with the existing app.

During Phase 1:

```powershell
npm run dev
npm run dev:next
```

`npm run dev` keeps the existing local admin/crawler workflow. `npm run dev:next` serves the new App Router public SEO route layer. Admin, API, worker, crawler, optimizer, S3 sync, and production publish remain on the existing runtime until later migration phases.
```

- [ ] **Step 2: Document frontend map**

Add to `docs/agent-playbooks/frontend-map.md`:

```markdown
## Next.js migration layer

Phase 1 public SEO routes live under `src/app`. Keep public server-rendered content there and keep browser-only resume/reader behavior in client islands under `src/components`.

Do not import admin or crawler UI into public Next routes.
```

- [ ] **Step 3: Run verification**

Run:

```powershell
node --require ./tests/setup-env.cjs --test tests/nextPublicData.test.mjs tests/seo.test.mjs tests/contentStore.test.mjs
npm run check:encoding
npm run build:next
```

Expected:

- All targeted tests pass.
- Encoding guard reports no mojibake.
- Next build succeeds.

- [ ] **Step 4: Smoke Next routes**

Start Next:

```powershell
npm run dev:next -- --port 54534
```

Smoke:

```powershell
node --input-type=module -e "for (const path of ['/', '/truyen/hoa-son-tai-khoi', '/the-loai/action']) { const res = await fetch('http://localhost:54534' + path); const text = await res.text(); console.log(path, res.status, /<h1|<title/.test(text), /Server error|Application error/.test(text)); }"
```

Expected: each route returns HTTP 200 or an intentional 404 for missing fixture slugs, includes server-rendered HTML, and does not show server/application errors.

## Follow-Up Tasks After Phase 1

- Port full reader observer/windowing/runtime behavior from `public/app.js`, `public/readerWindow.mjs`, and `public/readerRestore.mjs` into `src/components/reader`.
- Move sitemap and robots to native Next metadata routes.
- Move public API endpoints from custom Node handler to Next Route Handlers.
- Migrate admin UI into route-scoped Next client components.
- Switch Vercel build/deploy to Next after parity smoke checks pass.
