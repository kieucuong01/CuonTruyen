'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { progressStorageKey, resolveContinueHrefWithFallback } from './continueHref.mjs';

export function ContinueIsland({ series, seriesList = [] }: { series?: any; seriesList?: any[] }) {
  const [href, setHref] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function resolveHref() {
      try {
        const seriesId = series?.id || window.localStorage.getItem('comic-reader-last-series');
        if (!seriesId) return;
        const raw = window.localStorage.getItem(progressStorageKey(seriesId));
        const progress = raw ? JSON.parse(raw) : null;
        if (!progress?.chapterId) return;

        const nextHref = await resolveContinueHrefWithFallback({
          seriesId,
          chapterId: progress.chapterId,
          series,
          seriesList,
          fetchSeries: async (targetSeriesId: string) => {
            const response = await fetch(`/api/series?series=${encodeURIComponent(targetSeriesId)}`, {
              headers: { accept: 'application/json' }
            });
            if (!response.ok) return null;
            return response.json();
          }
        });
        if (!nextHref || cancelled) return;
        setHref(nextHref);
      } catch {
        if (!cancelled) setHref('');
      }
    }

    resolveHref();
    return () => {
      cancelled = true;
    };
  }, [series, seriesList]);

  if (!href) return null;
  return <Link className="next-continue" href={href} prefetch={false}>Đọc tiếp</Link>;
}
