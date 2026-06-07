import Image from 'next/image';
import Link from 'next/link';
import { publicImageUrl } from '@/lib/shared/urls';

export function SeriesCard({ series, priority = false }: { series: any; priority?: boolean }) {
  const href = series?.slug ? `/truyen/${encodeURIComponent(series.slug)}` : '#';
  const cover = publicImageUrl(series?.thumbnailUrl || series?.coverUrl || series?.coverThumbnail?.url);

  return (
    <article className="next-card">
      <Link className="next-card-link" href={href} prefetch={false}>
        {cover ? (
          <span className="next-cover-frame">
            <Image
              src={cover}
              alt={series.title || 'Truyện'}
              fill
              priority={priority}
              sizes="(max-width: 720px) 46vw, 180px"
              className="next-cover-image"
            />
          </span>
        ) : null}
        <div className="next-card-copy">
          <strong>{series.title || 'Truyện chưa đặt tên'}</strong>
          <p className="next-muted">{Number(series.chapterCount || 0).toLocaleString('vi-VN')} chương</p>
        </div>
      </Link>
    </article>
  );
}
