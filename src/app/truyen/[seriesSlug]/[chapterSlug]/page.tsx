import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ReaderIsland } from '@/components/reader/ReaderIsland';
import { JsonLd } from '@/components/seo/JsonLd';
import { breadcrumbJsonLd, chapterJsonLd } from '@/lib/server/next-json-ld.mjs';
import { cachedNextPublicReaderData } from '@/lib/server/public-data.mjs';
import { absoluteSiteUrl, publicImageUrl, siteBaseUrl } from '@/lib/shared/urls';

export const dynamic = 'force-dynamic';

function pageImageUrl(page: any, fallback = '') {
  const raw = Array.isArray(page) ? page[1] : page?.imageUrl || page?.url || page?.src || fallback;
  return publicImageUrl(raw);
}

export async function generateMetadata({ params }: { params: Promise<{ seriesSlug: string; chapterSlug: string }> }): Promise<Metadata> {
  const { seriesSlug, chapterSlug } = await params;
  const payload = await cachedNextPublicReaderData(seriesSlug, chapterSlug);
  if (!payload) return {};
  const title = `${payload.series.title} - ${payload.chapter.title || payload.chapter.label}`;
  const url = absoluteSiteUrl(`/truyen/${payload.series.slug}/${payload.chapter.slug || payload.chapter.id}`);
  const image = pageImageUrl(payload.chapter.pages?.[0], payload.series.thumbnailUrl || payload.series.coverUrl);
  const description = `Đọc ${title} online tại Cuộn Truyện với reader nối chương liền mạch và lưu vị trí đọc.`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      images: image ? [{ url: image }] : []
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: image ? [image] : []
    }
  };
}

export default async function ReaderPage({ params }: { params: Promise<{ seriesSlug: string; chapterSlug: string }> }) {
  const { seriesSlug, chapterSlug } = await params;
  const payload = await cachedNextPublicReaderData(seriesSlug, chapterSlug);
  if (!payload) notFound();
  const firstPageImage = pageImageUrl(payload.chapter.pages?.[0], payload.series.thumbnailUrl || payload.series.coverUrl);
  const chapterForSchema = {
    ...payload.chapter,
    slug: payload.chapter.slug || payload.chapter.id,
    pages: firstPageImage ? [{ imageUrl: firstPageImage }] : []
  };
  const baseUrl = siteBaseUrl();
  const chapterTitle = payload.chapter.title || payload.chapter.label;
  const jsonLd = [
    chapterJsonLd(payload.series, chapterForSchema, baseUrl),
    breadcrumbJsonLd([
      { name: 'Cuộn Truyện', path: '/' },
      { name: payload.series.title, path: `/truyen/${payload.series.slug}` },
      { name: chapterTitle, path: `/truyen/${payload.series.slug}/${payload.chapter.slug || payload.chapter.id}` }
    ], baseUrl)
  ];

  return (
    <main className="next-shell">
      <JsonLd data={jsonLd} />
      <header className="next-topbar">
        <Link className="next-brand" href={`/truyen/${payload.series.slug}`}>{payload.series.title}</Link>
        <span className="next-muted">{payload.chapter.title || payload.chapter.label}</span>
      </header>
      <h1>{payload.chapter.title || payload.chapter.label}</h1>
      <ReaderIsland initialPayload={payload} />
    </main>
  );
}
