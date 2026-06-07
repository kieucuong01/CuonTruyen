import {
  buildHomeCollections,
  buildReaderChapterPayload,
  buildTagPage,
  findSeriesBySlug,
  publicCatalog,
  publicSeriesDetail,
  searchCatalog
} from '../../../server/contentStore.mjs';
import { getSeries, readCatalog } from '../../../server/dataStore.mjs';

async function resolveCatalog(options = {}, readOptions = { includePages: false }) {
  return options.catalog || await readCatalog(readOptions);
}

async function resolvePublicSeries(id, options = {}) {
  const catalog = await resolveCatalog(options, { includePages: false });
  const series = findSeriesBySlug(catalog, id) || (!options.catalog
    ? await getSeries(id, { includePages: false, includeDraft: false })
    : null);
  if (!series) return null;
  const detail = publicSeriesDetail(series);
  return detail.status === 'public' ? detail : null;
}

async function resolveReaderCatalog(seriesSlug, options = {}) {
  if (options.catalog) return options.catalog;
  const series = await getSeries(decodeURIComponent(seriesSlug), {
    includePages: true,
    includeDraft: false
  });
  return { series: series ? [series] : [] };
}

export async function nextPublicCatalogApi(options = {}) {
  const catalog = await resolveCatalog(options, { includePages: false });
  return { status: 200, body: publicCatalog(catalog) };
}

export async function nextPublicSeriesApi(id = '', options = {}) {
  const target = String(id || '').trim();
  if (!target) return nextPublicCatalogApi(options);
  const series = await resolvePublicSeries(target, options);
  return {
    status: series ? 200 : 404,
    body: series || { error: 'Series not found' }
  };
}

export async function nextPublicHomeApi(options = {}) {
  const catalog = await resolveCatalog(options, { includePages: false });
  return { status: 200, body: buildHomeCollections(catalog) };
}

export async function nextPublicSearchApi(query = '', options = {}) {
  const catalog = await resolveCatalog(options, { includePages: false });
  return { status: 200, body: { series: searchCatalog(catalog, query) } };
}

export async function nextPublicTagApi(tagSlug = '', options = {}) {
  const catalog = await resolveCatalog(options, { includePages: false });
  const page = buildTagPage(catalog, tagSlug);
  return {
    status: page ? 200 : 404,
    body: page || { error: 'Tag not found' }
  };
}

export async function nextPublicReaderApi({ seriesSlug = '', chapterSlug = '', window = 0, start = 'current' } = {}, options = {}) {
  const series = String(seriesSlug || '').trim();
  const chapter = String(chapterSlug || '').trim();
  const payload = series && chapter
    ? buildReaderChapterPayload(await resolveReaderCatalog(series, options), series, chapter, {
        window: Number(window || 0),
        start: String(start || 'current').trim() || 'current'
      })
    : null;
  return {
    status: payload ? 200 : 404,
    body: payload || { error: 'Chapter not found' }
  };
}
