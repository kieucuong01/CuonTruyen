'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  chapterHrefSegment,
  createReaderProgressSnapshot,
  getNextSummaryAfterLastLoaded,
  mergeReaderChapters,
  pageSrc,
  progressStorageKey,
  readerChapterApiPath,
  readerChaptersFromPayload,
  readerCurrentChapterLabel,
  resolveActiveReaderChapterId,
  updateReadingHistory
} from './readerState.mjs';
import { applyReaderImageWindow } from './readerWindowing.mjs';

export function ReaderIsland({ initialPayload }: { initialPayload: any }) {
  const [payload] = useState(initialPayload);
  const [chapters, setChapters] = useState(() => readerChaptersFromPayload(initialPayload));
  const [currentChapterId, setCurrentChapterId] = useState(() => initialPayload?.chapter?.id || chapters[0]?.id || '');
  const [loadingNext, setLoadingNext] = useState(false);
  const [readerError, setReaderError] = useState('');
  const chaptersRef = useRef(chapters);
  const currentChapterRef = useRef(currentChapterId);
  const frameRef = useRef<number | null>(null);
  const restoreTimerRef = useRef<number | null>(null);
  const loadingNextRef = useRef(false);
  const restoringRef = useRef(false);
  const series = payload?.series || {};
  const catalogChapters = useMemo(() => series.chapters || [], [series.chapters]);
  const currentChapterLabel = useMemo(
    () => readerCurrentChapterLabel(chapters, currentChapterId),
    [chapters, currentChapterId]
  );

  useEffect(() => {
    chaptersRef.current = chapters;
  }, [chapters]);

  useEffect(() => {
    currentChapterRef.current = currentChapterId;
  }, [currentChapterId]);

  const loadNextChapter = useCallback(async () => {
    if (loadingNextRef.current || !series?.slug) return;
    const next = getNextSummaryAfterLastLoaded({
      readerChapters: chaptersRef.current,
      series
    });
    if (!next) return;

    loadingNextRef.current = true;
    setLoadingNext(true);
    setReaderError('');
    try {
      const response = await fetch(readerChapterApiPath(series.slug, chapterHrefSegment(next)), {
        headers: { accept: 'application/json' }
      });
      if (!response.ok) throw new Error(`Reader API ${response.status}`);
      const nextPayload = await response.json();
      const incoming = readerChaptersFromPayload(nextPayload);
      setChapters((current) => mergeReaderChapters(current, incoming, catalogChapters));
    } catch {
      setReaderError('Không tải được chương kế tiếp.');
    } finally {
      loadingNextRef.current = false;
      setLoadingNext(false);
    }
  }, [catalogChapters, series]);

  const updateReaderProgress = useCallback((shouldSave = true) => {
    applyReaderImageWindow({
      images: [...document.querySelectorAll<HTMLElement>('[data-reader-page-src]')],
      scrollY: window.scrollY,
      viewportHeight: window.innerHeight
    });

    const layouts = [...document.querySelectorAll<HTMLElement>('[data-reader-chapter]')].map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        id: node.dataset.readerChapter || '',
        top: window.scrollY + rect.top,
        bottom: window.scrollY + rect.bottom,
        node
      };
    }).filter((layout) => layout.id);
    const viewportY = window.scrollY + Math.min(window.innerHeight * 0.42, 360);
    const nextChapterId = resolveActiveReaderChapterId({
      layouts,
      viewportY,
      fallbackId: currentChapterRef.current
    });
    if (nextChapterId && nextChapterId !== currentChapterRef.current) {
      currentChapterRef.current = nextChapterId;
      setCurrentChapterId(nextChapterId);
      const activeChapter = chaptersRef.current.find((chapter: any) => chapter.id === nextChapterId)
        || catalogChapters.find((chapter: any) => chapter.id === nextChapterId);
      const segment = chapterHrefSegment(activeChapter);
      if (series?.slug && segment) {
        window.history.replaceState({}, '', `/truyen/${series.slug}/${encodeURIComponent(segment)}`);
      }
    }

    if (!shouldSave || restoringRef.current || !series?.id || !nextChapterId) return;
    const activeLayout = layouts.find((layout) => layout.id === nextChapterId);
    const activePage = document
      .elementFromPoint(window.innerWidth / 2, Math.min(window.innerHeight * 0.42, 360))
      ?.closest?.('[data-reader-page-index]') as HTMLElement | null;
    const pageIndex = Number(activePage?.dataset?.readerPageIndex || 0);
    const snapshot = createReaderProgressSnapshot({
      seriesId: series.id,
      chapterId: nextChapterId,
      pageIndex,
      scrollY: window.scrollY,
      chapterTop: activeLayout?.top || 0,
      documentScrollableHeight: document.documentElement.scrollHeight - window.innerHeight
    });
    try {
      window.localStorage.setItem(progressStorageKey(series.id), JSON.stringify(snapshot));
      window.localStorage.setItem('comic-reader-last-series', series.id);
      const rawHistory = window.localStorage.getItem('comic-reader-history');
      const history = rawHistory ? JSON.parse(rawHistory) : [];
      window.localStorage.setItem('comic-reader-history', JSON.stringify(updateReadingHistory(Array.isArray(history) ? history : [], series.id)));
    } catch {
      // Storage can be restricted; the reader remains usable without persistence.
    }

    const remaining = document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
    if (remaining < Math.max(1200, window.innerHeight * 1.8)) {
      void loadNextChapter();
    }
  }, [catalogChapters, loadNextChapter, series]);

  useEffect(() => {
    const seriesId = payload?.series?.id;
    if (!seriesId) return;
    let saved: any = null;
    try {
      const raw = window.localStorage.getItem(progressStorageKey(seriesId));
      saved = raw ? JSON.parse(raw) : null;
    } catch {
      saved = null;
    }

    const applyRestore = () => {
      if (!saved?.chapterId) return;
      const target = [...document.querySelectorAll<HTMLElement>('[data-reader-chapter]')]
        .find((node) => node.dataset.readerChapter === saved.chapterId);
      if (!target) return;
      const targetTop = window.scrollY + target.getBoundingClientRect().top;
      window.scrollTo({ top: targetTop + Number(saved.chapterScrollY || 0), behavior: 'auto' });
    };

    if (saved?.chapterId) {
      restoringRef.current = true;
      setCurrentChapterId(saved.chapterId);
      restoreTimerRef.current = window.setTimeout(() => {
        applyRestore();
        window.setTimeout(() => {
          restoringRef.current = false;
          updateReaderProgress(false);
        }, 500);
      }, 120);
    } else {
      updateReaderProgress(false);
    }

    const handleScroll = () => {
      if (frameRef.current !== null) return;
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        updateReaderProgress(true);
      });
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      if (restoreTimerRef.current !== null) window.clearTimeout(restoreTimerRef.current);
    };
  }, [payload, updateReaderProgress]);

  return (
    <section className="next-reader" data-reader-series={series?.id || ''} data-current-chapter={currentChapterId}>
      {currentChapterLabel ? (
        <div className="next-reader-current" aria-live="polite">
          <span>Đang đọc</span>
          <strong>{currentChapterLabel}</strong>
        </div>
      ) : null}
      {chapters.map((chapter: any, chapterIndex: number) => (
        <article
          className="next-reader-chapter"
          data-reader-chapter={chapter.id}
          key={chapter.id}
        >
          <h2 className="next-reader-title">{chapter.title || chapter.label}</h2>
          <div className="next-reader-page">
            {(chapter.pages || []).map((page: any, index: number) => {
              const src = pageSrc(page);
              if (!src) return null;
              return (
                <img
                  data-reader-page-index={index}
                  data-reader-page-src={src}
                  key={`${chapter.id}-${src}-${index}`}
                  src={src}
                  alt={`${chapter.title || chapter.label || 'Trang'} ${index + 1}`}
                  loading={chapterIndex === 0 && index < 2 ? 'eager' : 'lazy'}
                  fetchPriority={chapterIndex === 0 && index === 0 ? 'high' : 'auto'}
                  decoding="async"
                />
              );
            })}
          </div>
        </article>
      ))}
      {(loadingNext || readerError) && (
        <p className="next-reader-status" role="status">{loadingNext ? 'Đang tải chương kế tiếp...' : readerError}</p>
      )}
    </section>
  );
}
