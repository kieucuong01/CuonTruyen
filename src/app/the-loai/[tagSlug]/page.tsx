import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SeriesCard } from '@/components/public/SeriesCard';
import { JsonLd } from '@/components/seo/JsonLd';
import { breadcrumbJsonLd, tagPageJsonLd } from '@/lib/server/next-json-ld.mjs';
import { cachedNextPublicTagData } from '@/lib/server/public-data.mjs';
import { absoluteSiteUrl, siteBaseUrl } from '@/lib/shared/urls';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ tagSlug: string }> }): Promise<Metadata> {
  const { tagSlug } = await params;
  const page = await cachedNextPublicTagData(tagSlug);
  if (!page) return {};
  const title = page.title || `Thể loại ${tagSlug}`;
  const description = page.description || `Đọc truyện ${title} tại Cuộn Truyện.`;
  const url = absoluteSiteUrl(`/the-loai/${page.slug || tagSlug}`);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url },
    twitter: { card: 'summary', title, description }
  };
}

export default async function TagPage({ params }: { params: Promise<{ tagSlug: string }> }) {
  const { tagSlug } = await params;
  const page = await cachedNextPublicTagData(tagSlug);
  if (!page) notFound();
  const seriesList = page.series || [];
  const baseUrl = siteBaseUrl();
  const jsonLd = [
    tagPageJsonLd(page, baseUrl),
    breadcrumbJsonLd([
      { name: 'Cuộn Truyện', path: '/' },
      { name: page.title || 'Thể loại truyện', path: `/the-loai/${page.slug || tagSlug}` }
    ], baseUrl)
  ];

  return (
    <main className="next-shell">
      <JsonLd data={jsonLd} />
      <header className="next-topbar">
        <Link className="next-brand" href="/">Cuộn Truyện</Link>
      </header>
      <h1>{page.title || 'Thể loại truyện'}</h1>
      <p className="next-muted">{page.description || 'Khám phá truyện tranh theo thể loại.'}</p>
      <div className="next-grid">
        {seriesList.map((series: any, index) => (
          <SeriesCard key={series.id || series.slug} series={series} priority={index < 2} />
        ))}
      </div>
    </main>
  );
}
