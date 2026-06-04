import path from 'node:path';
import { decodeEntities, slugify, stripTags, uniqueBy } from '../utils.mjs';

const LINK_RE = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
const ATTR_RE = /\b([a-zA-Z0-9_-]+)=["']([^"']*)["']/g;

function attrs(tag) {
  return Object.fromEntries([...tag.matchAll(ATTR_RE)].map((match) => [match[1], decodeEntities(match[2])]));
}

function resolveUrl(value, baseUrl) {
  if (!value) return '';
  const clean = decodeEntities(value).trim();
  if (clean.startsWith('//')) return new URL(new URL(baseUrl).protocol + clean).href;
  return new URL(clean, baseUrl).href;
}

function metaContent(html, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<meta\\b[^>]*(?:name|property|itemprop)=["']${escaped}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0] || '';
  return attrs(tag).content || '';
}

function extractTitle(html) {
  return (
    metaContent(html, 'name') ||
    metaContent(html, 'og:title').replace(/\s+chương\s+mới\s+nhất.*$/iu, '') ||
    stripTags(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '') ||
    stripTags(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+chương\s+mới\s+nhất.*$/iu, '') ||
    'Imported Comic'
  );
}

function chapterNumber(label, url) {
  const value = `${label} ${url}`.match(/(?:chap|chuong|chương)[^\d]{0,8}(\d+(?:\.\d+)?)/iu);
  return value ? Number(value[1]) : Number.POSITIVE_INFINITY;
}

export function parseSeriesPage(html, seriesUrl) {
  const title = extractTitle(html);
  const seriesPath = new URL(seriesUrl).pathname;
  const seriesKey = path.basename(seriesPath).replace(/\.html?$/i, '');
  const chapterPathRe = new RegExp(`/truyen-tranh/${seriesKey}-chap-`, 'i');

  const chapters = uniqueBy(
    [...html.matchAll(LINK_RE)]
      .map((match) => ({
        url: resolveUrl(match[1], seriesUrl),
        label: stripTags(match[2])
      }))
      .filter((link) => {
        const parsedUrl = new URL(link.url);
        return parsedUrl.origin === new URL(seriesUrl).origin && chapterPathRe.test(parsedUrl.pathname);
      }),
    (chapter) => chapter.url
  )
    .sort((a, b) => chapterNumber(a.label, a.url) - chapterNumber(b.label, b.url))
    .map((chapter, index) => ({
      id: `${slugify(chapter.label || `chapter-${index + 1}`)}-${index + 1}`,
      label: chapter.label || `Chương ${index + 1}`,
      url: chapter.url,
      sourceOrder: index
    }));

  return {
    title,
    slug: slugify(title),
    sourceUrl: seriesUrl,
    coverUrl: metaContent(html, 'image') || metaContent(html, 'og:image') || metaContent(html, 'thumbnail'),
    chapters
  };
}

export function extractChapterImages(html, chapterUrl) {
  const pageBlocks = [...html.matchAll(/<div\b[^>]*class=["'][^"']*page-chapter[^"']*["'][^>]*>[\s\S]*?<\/div>/gi)]
    .map((match) => match[0]);
  const source = pageBlocks.length ? pageBlocks.join('\n') : html;
  const imageUrls = [...source.matchAll(/<img\b[^>]*>/gi)]
    .map((match) => {
      const tagAttrs = attrs(match[0]);
      return tagAttrs['data-original'] || tagAttrs['data-cdn'] || tagAttrs.src || tagAttrs['data-src'] || '';
    })
    .filter(Boolean)
    .map((url) => resolveUrl(url, chapterUrl))
    .filter((url) => {
      const lower = url.toLowerCase();
      if (!/\.(jpe?g|png|webp)(?:$|[?#])/i.test(lower)) return false;
      if (/(logo|avatar|noavatar|no_image|banner|ads?|loading|placeholder|gif;base64)/i.test(lower)) return false;
      return true;
    });
  return uniqueBy(imageUrls);
}

export function filenameForImage(url, index) {
  const parsed = new URL(url);
  const ext = path.extname(parsed.pathname).toLowerCase() || '.jpg';
  return `${String(index + 1).padStart(3, '0')}${ext}`;
}

export async function fetchHtml(url) {
  let response;
  try {
    response = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'vi,en-US;q=0.9,en;q=0.8',
        referer: new URL(url).origin
      }
    });
  } catch (error) {
    throw new Error(`Fetch failed for ${url}: ${error.message || String(error)}`);
  }
  if (!response.ok) throw new Error(`Fetch failed ${response.status} for ${url}`);
  const html = await response.text();
  if (html.length < 200 || /^(connection refused|access denied|captcha)/i.test(html.trim())) {
    throw new Error(`Source returned an unusable page for ${url}`);
  }
  return html;
}

export const truyenqqAdapter = {
  name: 'truyenqq',
  hostnames: ['truyenqqko.com', 'truyenqqgo.com'],
  parseSeriesPage,
  extractChapterImages,
  filenameForImage,
  fetchHtml
};
