import path from 'node:path';
import { decodeEntities, slugify, stripTags, uniqueBy } from '../utils.mjs';

const IMAGE_ATTR_RE = /\b(?:data-src|data-original|data-lazy-src|src)=["']([^"']+)["']/gi;
const LINK_RE = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

export function resolveUrl(value, baseUrl) {
  if (!value) return '';
  const clean = decodeEntities(value).trim();
  if (clean.startsWith('//')) return new URL(new URL(baseUrl).protocol + clean).href;
  return new URL(clean, baseUrl).href;
}

function extractTitle(html) {
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return stripTags(h1[1]);
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return title ? stripTags(title[1]).replace(/\s*[-|].*$/u, '') : 'Imported Comic';
}

function extractCover(html, baseUrl) {
  const candidates = [...html.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);
  const coverTag =
    candidates.find((tag) => /cover|thumb|avatar|poster|book/i.test(tag)) ||
    candidates.find((tag) => !/logo|icon|banner|ads?/i.test(tag));
  if (!coverTag) return '';
  const attr = [...coverTag.matchAll(IMAGE_ATTR_RE)][0];
  return attr ? resolveUrl(attr[1], baseUrl) : '';
}

function chapterNumber(label, url) {
  const text = `${label} ${url}`;
  const decimal = text.match(/(?:chapter|chap|chuong|chương|tap|tập)[^\d]{0,8}(\d+(?:\.\d+)?)/iu);
  if (decimal) return Number(decimal[1]);
  const any = text.match(/(\d+(?:\.\d+)?)/u);
  return any ? Number(any[1]) : Number.POSITIVE_INFINITY;
}

export function parseSeriesPage(html, seriesUrl) {
  const title = extractTitle(html);
  const seriesPath = new URL(seriesUrl).pathname;
  const seriesKey = path.basename(seriesPath).replace(/\.html?$/i, '');
  const expectedChapterPrefix = `/truyen-tranh/${seriesKey}/`;
  const rawLinks = [...html.matchAll(LINK_RE)].map((match) => {
    const label = stripTags(match[2]);
    const url = resolveUrl(match[1], seriesUrl);
    return { label, url };
  });

  const chapters = uniqueBy(
    rawLinks.filter((link) => {
      const target = `${link.label} ${link.url}`;
      if (!/(chapter|chap|chuong|chương|tap|tập|\b\d+\b)/iu.test(target)) return false;
      if (/(the-loai|genre|category|tag|login|dang-nhap|search|tim-kiem)/iu.test(link.url)) return false;
      const parsedUrl = new URL(link.url);
      if (parsedUrl.origin !== new URL(seriesUrl).origin) return false;
      return parsedUrl.pathname.startsWith(expectedChapterPrefix);
    }),
    (link) => link.url
  )
    .sort((a, b) => chapterNumber(a.label, a.url) - chapterNumber(b.label, b.url))
    .map((chapter, index) => ({
      id: `${slugify(chapter.label || `chapter-${index + 1}`)}-${index + 1}`,
      label: chapter.label || `Chapter ${index + 1}`,
      url: chapter.url,
      sourceOrder: index
    }));

  return {
    title,
    slug: slugify(title),
    sourceUrl: seriesUrl,
    coverUrl: extractCover(html, seriesUrl),
    chapters
  };
}

export function extractChapterImages(html, chapterUrl) {
  const imageUrls = [...html.matchAll(/<img\b[^>]*>/gi)]
    .map((tag) => {
      const attr = [...tag[0].matchAll(IMAGE_ATTR_RE)][0];
      return attr ? { tag: tag[0], url: resolveUrl(attr[1], chapterUrl) } : null;
    })
    .filter(Boolean)
    .filter(({ tag, url }) => {
      const lower = url.toLowerCase();
      if (!/\.(jpe?g|png|webp)(?:$|[?#])/i.test(lower)) return false;
      if (/(logo|icon|avatar|banner|ads?|loading|placeholder|spacer|cover|credit|promotion)/i.test(`${lower} ${tag}`)) return false;
      if (/\bwidth=["']?100["']?/i.test(tag) && /\bheight=["']?140["']?/i.test(tag)) return false;
      return true;
    })
    .map(({ url }) => url);
  return uniqueBy(imageUrls);
}

export function filenameForImage(url, index) {
  const parsed = new URL(url);
  const ext = path.extname(parsed.pathname).toLowerCase() || '.jpg';
  return `${String(index + 1).padStart(3, '0')}${ext.split('?')[0]}`;
}

export async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 ComicReaderPrototype/0.1',
      accept: 'text/html,application/xhtml+xml'
    }
  });
  if (!response.ok) throw new Error(`Fetch failed ${response.status} for ${url}`);
  const html = await response.text();
  if (html.length < 200 || /connection refused|access denied|captcha/i.test(html)) {
    throw new Error(`Source returned an unusable page for ${url}`);
  }
  return html;
}

export const manhuarockAdapter = {
  name: 'manhuarock',
  hostnames: ['manhuarock4.site'],
  parseSeriesPage,
  extractChapterImages,
  filenameForImage,
  fetchHtml
};
