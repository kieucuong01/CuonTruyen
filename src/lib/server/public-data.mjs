import { cache } from 'react';
import {
  buildHomeCollections,
  buildReaderChapterPayload,
  buildTagPage,
  findSeriesBySlug,
  publicCatalog,
  publicSeriesDetail
} from '../../../server/contentStore.mjs';
import { readCatalog } from '../../../server/dataStore.mjs';
import { tagSeoCopy } from '../../../server/seo.mjs';

async function resolveCatalog(options = {}, readOptions = { includePages: false }) {
  if (options.catalog) return options.catalog;
  const reader = options.readCatalog || readCatalog;
  return reader(readOptions);
}

export async function nextPublicHomeData(options = {}) {
  const catalog = await resolveCatalog(options, { includePages: false });
  const home = buildHomeCollections(catalog);
  const list = publicCatalog(catalog).series || [];
  return {
    ...home,
    popular: home.hot || list.slice(0, 12),
    updated: home.updated || list.slice(0, 24),
    tags: home.tags || []
  };
}

export async function nextPublicSeriesData(seriesSlug, options = {}) {
  const catalog = await resolveCatalog(options, { includePages: false });
  const series = findSeriesBySlug(catalog, seriesSlug);
  if (!series) return null;
  return publicSeriesDetail(series);
}

export async function nextPublicReaderData(seriesSlug, chapterSlug, options = {}) {
  const catalog = await resolveCatalog(options, { includePages: true });
  const payload = buildReaderChapterPayload(catalog, seriesSlug, chapterSlug, { window: 1 });
  if (!payload) return null;
  const series = findSeriesBySlug(catalog, seriesSlug);
  const detail = series ? publicSeriesDetail(series) : null;
  return {
    ...payload,
    series: {
      ...payload.series,
      chapters: detail?.chapters || []
    }
  };
}

export async function nextPublicTagData(tagSlug, options = {}) {
  const catalog = await resolveCatalog(options, { includePages: false });
  const page = buildTagPage(catalog, tagSlug);
  if (!page) return null;
  const seo = tagSeoCopy(page.tag);
  return {
    ...page,
    slug: page.tag.slug,
    title: seo.title,
    description: seo.description
  };
}

export const cachedNextPublicHomeData = cache(nextPublicHomeData);
export const cachedNextPublicSeriesData = cache(nextPublicSeriesData);
export const cachedNextPublicReaderData = cache(nextPublicReaderData);
export const cachedNextPublicTagData = cache(nextPublicTagData);
