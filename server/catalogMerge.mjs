export function mergeSeries(existing, incoming) {
  if (!existing) return incoming;
  const incomingChapterIds = new Set(incoming.chapters.map((chapter) => chapter.id));
  const existingOnlyChapters = existing.chapters.filter((chapter) => !incomingChapterIds.has(chapter.id));
  const mergedIncomingChapters = incoming.chapters.map((chapter) => {
    const previous = existing.chapters.find((item) => item.id === chapter.id);
    const previousWasPublic = previous?.status === 'public' || (!previous?.status && (previous?.imported || previous?.pages?.length));
    const next = chapter.imported || !previous?.imported ? chapter : previous;
    return {
      ...next,
      status: previousWasPublic ? 'public' : (previous?.status || next.status)
    };
  });
  const existingWasPublic = existing.status === 'public' || (!existing.status && existing.chapters?.some((chapter) => chapter.imported || chapter.pages?.length));

  return {
    ...existing,
    ...incoming,
    status: existingWasPublic ? 'public' : (incoming.status || existing.status),
    importedAt: existing.importedAt || incoming.importedAt,
    chapters: [...mergedIncomingChapters, ...existingOnlyChapters]
      .sort((a, b) => Number(a.sourceOrder ?? 0) - Number(b.sourceOrder ?? 0))
  };
}
