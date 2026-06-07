export function siteBaseUrl() {
  return (process.env.PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://cuontruyen.vercel.app').replace(/\/+$/, '');
}

export function absoluteSiteUrl(pathname = '/') {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${siteBaseUrl()}${path}`;
}

export function publicImageUrl(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const importsBase = String(process.env.PUBLIC_IMPORTS_BASE_URL || '').replace(/\/+$/, '');
  if (importsBase && raw.startsWith('/imports/')) return `${importsBase}${raw}`;
  return raw;
}
