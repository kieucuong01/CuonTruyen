export function hasReadableChapter(chapter = {}) {
  if (Array.isArray(chapter.pages)) return chapter.pages.length > 0;
  return Boolean(chapter.imported && Number(chapter.pageCount || 0) > 0);
}
