import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ContinueIsland } from '@/components/public/ContinueIsland';
import { JsonLd } from '@/components/seo/JsonLd';
import { breadcrumbJsonLd, seriesJsonLd } from '@/lib/server/next-json-ld.mjs';
import { cachedNextPublicSeriesData } from '@/lib/server/public-data.mjs';
import { absoluteSiteUrl, publicImageUrl, siteBaseUrl } from '@/lib/shared/urls';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ seriesSlug: string }> }): Promise<Metadata> {
  const { seriesSlug } = await params;
  const series = await cachedNextPublicSeriesData(seriesSlug);
  if (!series) return {};
  const url = absoluteSiteUrl(`/truyen/${series.slug}`);
  const image = publicImageUrl(series.thumbnailUrl || series.coverUrl || series.coverThumbnail?.url);
  const description = series.description || `Đọc ${series.title} liền mạch tại Cuộn Truyện, tự lưu vị trí và mở lại đúng chương đang đọc.`;
  return {
    title: `${series.title} - Đọc truyện tranh`,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${series.title} - Đọc truyện tranh`,
      description,
      url,
      images: image ? [{ url: image }] : []
    },
    twitter: {
      card: 'summary_large_image',
      title: `${series.title} - Đọc truyện tranh`,
      description,
      images: image ? [image] : []
    }
  };
}

export default async function SeriesPage({ params }: { params: Promise<{ seriesSlug: string }> }) {
  const { seriesSlug } = await params;
  const series = await cachedNextPublicSeriesData(seriesSlug);
  if (!series) notFound();
  const cover = publicImageUrl(series.thumbnailUrl || series.coverUrl || series.coverThumbnail?.url);
  const baseUrl = siteBaseUrl();
  const jsonLd = [
    seriesJsonLd({ ...series, coverUrl: cover || series.coverUrl }, baseUrl),
    breadcrumbJsonLd([
      { name: 'Cuộn Truyện', path: '/' },
      { name: series.title, path: `/truyen/${series.slug}` }
    ], baseUrl)
  ];

  return (
    <main className="next-shell">
      <JsonLd data={jsonLd} />
      <header className="next-topbar">
        <Link className="next-brand" href="/">Cuộn Truyện</Link>
        <ContinueIsland series={series} />
      </header>
      <section className="next-hero">
        {cover ? (
          <div className="next-hero-cover next-card">
            <Image
              src={cover}
              alt={series.title}
              fill
              priority
              sizes="(max-width: 720px) 112px, 240px"
              className="next-hero-cover-image"
            />
          </div>
        ) : null}
        <div>
          <h1>{series.title}</h1>
          <p className="next-muted">{series.description || 'Đọc liền mạch, tự lưu vị trí và mở lại đúng chương đang đọc.'}</p>
          <p>{(series.tags || []).map((tag: any) => tag.name).join(' · ')}</p>
          <Link
            className="next-primary-link"
            href={`/truyen/${series.slug}/${series.chapters?.[0]?.slug || series.chapters?.[0]?.id || ''}`}
            prefetch={false}
          >
            Đọc từ đầu
          </Link>
        </div>
      </section>
      <section>
        <h2>Danh sách chương</h2>
        <div>
          {(series.chapters || []).map((chapter: any) => (
            <p key={chapter.id}>
              <Link href={`/truyen/${series.slug}/${chapter.slug || chapter.id}`} prefetch={false}>{chapter.title || chapter.label || 'Chương'}</Link>
            </p>
          ))}
        </div>
      </section>
    </main>
  );
}
