export function shouldScrollToTopForRoute({ pathname = '', hash = '' } = {}) {
  const normalizedPath = String(pathname || '/');
  const normalizedHash = String(hash || '');
  if (/^#\/read\/[^/]+/.test(normalizedHash)) return false;
  if (/^\/truyen\/[^/]+\/[^/]+\/?$/.test(normalizedPath)) return false;
  return true;
}

export function scrollToTopForRoute(windowLike = globalThis, routeLike = windowLike?.location) {
  if (!shouldScrollToTopForRoute(routeLike)) return false;
  if (typeof windowLike?.scrollTo !== 'function') return false;
  windowLike.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  return true;
}
