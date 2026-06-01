export function shouldRestoreProgress(saved) {
  return Boolean(saved?.chapterScrollY || saved?.scrollY);
}

export function resolveSavedScrollTop(saved, { scrollY = 0, findChapterNode = () => null } = {}) {
  if (!saved) return 0;
  const chapterOffset = Number(saved.chapterScrollY ?? 0);
  if (saved.chapterId) {
    const chapterNode = findChapterNode(saved.chapterId);
    if (chapterNode) {
      const rect = chapterNode.getBoundingClientRect?.();
      const top = Number(rect?.top || 0);
      return Math.max(0, Math.round(scrollY + top + chapterOffset));
    }
  }
  return Math.max(0, Number(saved.scrollY || 0));
}
