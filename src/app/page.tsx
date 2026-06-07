import type { Metadata } from 'next';
import Link from 'next/link';
import { ContinueIsland } from '@/components/public/ContinueIsland';
import { SeriesCard } from '@/components/public/SeriesCard';
import { JsonLd } from '@/components/seo/JsonLd';
import { homePageJsonLd } from '@/lib/server/next-json-ld.mjs';
import { cachedNextPublicHomeData } from '@/lib/server/public-data.mjs';
import { absoluteSiteUrl, siteBaseUrl } from '@/lib/shared/urls';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  alternates: { canonical: absoluteSiteUrl('/') },
  openGraph: {
    title: 'Cuộn Truyện - Đọc truyện tranh liền mạch',
    description: 'Đọc truyện tranh manhwa, manhua, manga online liền mạch, tự lưu vị trí và mở lại đúng chương đang đọc.',
    url: absoluteSiteUrl('/')
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Cuộn Truyện - Đọc truyện tranh liền mạch',
    description: 'Đọc truyện tranh online liền mạch, tối ưu mobile và tự lưu tiến độ.'
  }
};

export default async function HomePage() {
  const home = await cachedNextPublicHomeData();
  const updated = home.updated || [];
  const popular = home.popular || [];
  const jsonLd = homePageJsonLd({ updated, popular }, siteBaseUrl());

  return (
    <main className="next-shell">
      <JsonLd data={jsonLd} />
      <header className="next-topbar">
        <Link className="next-brand" href="/">Cuộn Truyện</Link>
        <ContinueIsland />
      </header>

      <section>
        <p className="next-muted">Đọc liền mạch, tự lưu tiến độ, mở lại đúng chương đang đọc.</p>
        <h1>Truyện mới cập nhật</h1>
        <div className="next-grid">
          {updated.slice(0, 24).map((series: any, index) => (
            <SeriesCard key={series.id || series.slug} series={series} priority={index < 2} />
          ))}
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
