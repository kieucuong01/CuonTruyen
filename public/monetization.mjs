function readBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  return !['0', 'false', 'off', 'no'].includes(String(value).trim().toLowerCase());
}

function cleanText(value = '') {
  return String(value || '').trim();
}

function escapeAttr(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function normalizeAdSlots(source = {}) {
  const slots = source.adsenseSlots || source.adSlots || {};
  return {
    home: cleanText(slots.home || source.adsenseSlotHome || source.adSlotHome),
    series: cleanText(slots.series || source.adsenseSlotSeries || source.adSlotSeries),
    chapterEnd: cleanText(slots.chapterEnd || slots.chapter || source.adsenseSlotChapterEnd || source.adSlotChapterEnd)
  };
}

export function normalizeMonetizationConfig(config = {}) {
  const source = config && typeof config === 'object' ? config : {};
  const adsenseClient = cleanText(source.adsenseClient || source.adClient || source.googleAdsenseClient);
  return {
    adsEnabled: readBoolean(source.adsEnabled, true),
    donateUrl: typeof source.donateUrl === 'string' ? source.donateUrl : '',
    adminNoAds: readBoolean(source.adminNoAds, true),
    adsProvider: cleanText(source.adsProvider || (adsenseClient ? 'adsense' : '')),
    adsenseClient,
    adsenseSlots: normalizeAdSlots(source),
    adsenseTestMode: readBoolean(source.adsenseTestMode, false)
  };
}

export function shouldShowAds(options = {}) {
  const config = normalizeMonetizationConfig(options.config || {});
  if (!config.adsEnabled) return false;
  const route = String(options.route || '');
  if (config.adminNoAds && (route.startsWith('#/admin') || route.includes('/admin'))) return false;
  return true;
}

export function adSlotForPlacement(config = {}, placement = '') {
  const safeConfig = normalizeMonetizationConfig(config);
  const key = String(placement || '').trim();
  if (key === 'chapter-end' || key === 'chapterBreak' || key === 'chapter-break') {
    return safeConfig.adsenseSlots.chapterEnd;
  }
  return safeConfig.adsenseSlots[key] || '';
}

export function hasRealAdSlot(config = {}, placement = '') {
  const safeConfig = normalizeMonetizationConfig(config);
  return safeConfig.adsProvider === 'adsense'
    && Boolean(safeConfig.adsenseClient)
    && Boolean(adSlotForPlacement(safeConfig, placement));
}

export function renderAdSlotHtml({
  config = {},
  placement = '',
  className = '',
  seriesSlug = '',
  chapterSlug = '',
  label = 'Quảng cáo'
} = {}) {
  const safeConfig = normalizeMonetizationConfig(config);
  if (!hasRealAdSlot(safeConfig, placement)) return '';
  const adSlot = adSlotForPlacement(safeConfig, placement);
  const placementName = String(placement || '').trim();
  const extraAttrs = [
    seriesSlug ? `data-series-slug="${escapeAttr(seriesSlug)}"` : '',
    chapterSlug ? `data-chapter-slug="${escapeAttr(chapterSlug)}"` : ''
  ].filter(Boolean).join(' ');
  return `
    <section class="ad-slot adsense-slot ${escapeAttr(className)}" data-ad-placement="${escapeAttr(placementName)}" data-ad-provider="adsense" data-ad-slot-id="${escapeAttr(adSlot)}" ${extraAttrs} aria-label="${escapeAttr(label)}">
      <span class="ad-label">${escapeAttr(label)}</span>
      <ins class="adsbygoogle"
        style="display:block"
        data-ad-client="${escapeAttr(safeConfig.adsenseClient)}"
        data-ad-slot="${escapeAttr(adSlot)}"
        data-ad-format="auto"
        data-full-width-responsive="true"${safeConfig.adsenseTestMode ? ' data-adtest="on"' : ''}></ins>
    </section>
  `;
}
