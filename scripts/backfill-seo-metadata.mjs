import '../server/env.mjs';

import { fileURLToPath } from 'node:url';

import { readCatalog } from '../server/dataStore.mjs';
import { closePostgresPool, queryPostgres } from '../server/postgresStore.mjs';

const DEFAULT_MAX_DESCRIPTION_LENGTH = 190;

export function parseSeoBackfillArgs(argv = process.argv.slice(2)) {
  const args = {
    apply: false,
    json: false,
    limit: 0,
    seriesIds: new Set(),
    allStatuses: false,
    overwriteDescription: false,
    maxDescriptionLength: DEFAULT_MAX_DESCRIPTION_LENGTH
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--apply') {
      args.apply = true;
    } else if (token === '--json') {
      args.json = true;
    } else if (token === '--all-statuses') {
      args.allStatuses = true;
    } else if (token === '--overwrite-description') {
      args.overwriteDescription = true;
    } else if (token === '--limit') {
      args.limit = Number(argv[++index] || 0);
    } else if (token.startsWith('--limit=')) {
      args.limit = Number(token.slice('--limit='.length) || 0);
    } else if (token === '--series-id') {
      const value = argv[++index];
      if (value) args.seriesIds.add(value);
    } else if (token.startsWith('--series-id=')) {
      const value = token.slice('--series-id='.length);
      if (value) args.seriesIds.add(value);
    } else if (token === '--max-description-length') {
      args.maxDescriptionLength = Number(argv[++index] || DEFAULT_MAX_DESCRIPTION_LENGTH);
    } else if (token.startsWith('--max-description-length=')) {
      args.maxDescriptionLength = Number(token.slice('--max-description-length='.length) || DEFAULT_MAX_DESCRIPTION_LENGTH);
    }
  }

  if (!Number.isFinite(args.limit) || args.limit < 0) args.limit = 0;
  if (!Number.isFinite(args.maxDescriptionLength) || args.maxDescriptionLength < 120) {
    args.maxDescriptionLength = DEFAULT_MAX_DESCRIPTION_LENGTH;
  }
  return args;
}

export function auditSeriesSeo(series = {}) {
  const coverUrl = String(series.coverUrl || '');
  const thumbnailUrl = String(series.thumbnailUrl || series.coverThumbnailUrl || '').trim();
  const hasCoverThumbnail = Boolean(thumbnailUrl || series.coverThumbnail);
  return {
    id: series.id || '',
    slug: series.slug || '',
    title: series.title || '',
    status: series.status || '',
    missingDescription: !String(series.description || '').trim(),
    externalCover: /^https?:\/\//i.test(coverUrl),
    truyenqqCover: /^https?:\/\/([^/]+\.)?truyenqq/i.test(coverUrl),
    missingThumbnail: !hasCoverThumbnail,
    coverUrl,
    thumbnailUrl
  };
}

export function buildSeoDescription(series = {}, options = {}) {
  const title = cleanText(series.title || 'truyện tranh');
  const tags = normalizeTags(series.tags || []);
  const origin = originLabel(tags);
  const genres = genreLabels(tags).slice(0, 3);
  const chapterCount = publicChapterCount(series.chapters || []);
  const chapterText = chapterCount > 0 ? `${chapterCount} chương` : 'các chương mới';
  const genreText = genres.length ? `, thể loại ${genres.join(', ')}` : '';
  const originText = origin ? ` ${origin}` : '';
  const maxLength = options.maxLength || DEFAULT_MAX_DESCRIPTION_LENGTH;
  const variants = [
    `Đọc ${title} online tại Cuộn Truyện: ${chapterText}${originText}${genreText}. Cuộn dọc mượt, tự lưu tiến độ đọc tiếp.`,
    `Đọc ${title} online tại Cuộn Truyện: ${chapterText}${originText}. Cuộn dọc mượt, tự lưu tiến độ đọc tiếp.`,
    `Đọc ${title} tại Cuộn Truyện với ${chapterText}${originText}. Reader nhanh, dễ đọc trên điện thoại.`
  ];
  return variants.find((description) => description.length <= maxLength) || smartTrim(variants.at(-1), maxLength);
}

export function planSeoMetadataBackfill(catalog = {}, options = {}) {
  const seriesIds = options.seriesIds || new Set();
  const maxDescriptionLength = options.maxDescriptionLength || DEFAULT_MAX_DESCRIPTION_LENGTH;
  const candidates = [];
  const audit = {
    total: 0,
    scoped: 0,
    publicSeries: 0,
    missingDescriptions: 0,
    externalCovers: 0,
    truyenqqCovers: 0,
    missingThumbnails: 0
  };

  for (const series of catalog.series || []) {
    audit.total += 1;
    if (!options.allStatuses && series.status !== 'public') continue;
    if (seriesIds.size && !seriesIds.has(series.id) && !seriesIds.has(series.slug)) continue;
    audit.scoped += 1;
    if (series.status === 'public') audit.publicSeries += 1;

    const seriesAudit = auditSeriesSeo(series);
    if (seriesAudit.missingDescription) audit.missingDescriptions += 1;
    if (seriesAudit.externalCover) audit.externalCovers += 1;
    if (seriesAudit.truyenqqCover) audit.truyenqqCovers += 1;
    if (seriesAudit.missingThumbnail) audit.missingThumbnails += 1;

    const existingDescription = String(series.description || '').trim();
    if (existingDescription && !options.overwriteDescription) continue;

    const description = buildSeoDescription(series, { maxLength: maxDescriptionLength });
    if (!description || description === existingDescription) continue;
    candidates.push({
      id: series.id,
      slug: series.slug,
      title: series.title,
      description,
      previousDescription: existingDescription
    });
  }

  const limit = Number(options.limit || 0);
  return {
    audit,
    updates: limit > 0 ? candidates.slice(0, limit) : candidates
  };
}

export async function runSeoMetadataBackfill(rawArgs = process.argv.slice(2)) {
  const args = parseSeoBackfillArgs(rawArgs);
  const catalog = await readCatalog({ includePages: false });
  const plan = planSeoMetadataBackfill(catalog, args);

  const applied = [];
  if (args.apply) {
    for (const update of plan.updates) {
      await queryPostgres(
        'update series set description = $1, updated_at = now() where id = $2',
        [update.description, update.id]
      );
      applied.push(update.id);
    }
  }

  const result = {
    mode: args.apply ? 'apply' : 'dry-run',
    audit: plan.audit,
    plannedDescriptions: plan.updates.length,
    appliedDescriptions: applied.length,
    updates: plan.updates
  };

  printResult(result, args);
  return result;
}

function printResult(result, args) {
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`SEO metadata backfill ${result.mode}. ${result.mode === 'dry-run' ? 'No database rows were changed.' : 'Database rows were updated.'}`);
  console.log(`Scoped series: ${result.audit.scoped}/${result.audit.total}`);
  console.log(`Missing descriptions: ${result.audit.missingDescriptions}`);
  console.log(`Planned description updates: ${result.plannedDescriptions}`);
  console.log(`Applied description updates: ${result.appliedDescriptions}`);
  console.log(`External covers: ${result.audit.externalCovers} (${result.audit.truyenqqCovers} from truyenqq)`);
  console.log(`Missing thumbnails: ${result.audit.missingThumbnails}`);
  for (const update of result.updates.slice(0, 10)) {
    console.log(`- ${update.id}: ${update.description}`);
  }
  if (result.updates.length > 10) {
    console.log(`...and ${result.updates.length - 10} more.`);
  }
}

function normalizeTags(tags) {
  return tags
    .map((tag) => ({
      slug: cleanText(tag.slug || '').toLowerCase(),
      name: cleanText(tag.name || tag.slug || '')
    }))
    .filter((tag) => tag.slug || tag.name);
}

function originLabel(tags) {
  const haystack = tags.map((tag) => `${tag.slug} ${tag.name}`.toLowerCase()).join(' ');
  if (/(manhwa|han-quoc|hàn|han\b)/i.test(haystack)) return 'truyện Hàn';
  if (/(manhua|trung-quoc|trung\b)/i.test(haystack)) return 'truyện Trung';
  if (/(manga|nhat-ban|nhật|nhat\b)/i.test(haystack)) return 'truyện Nhật';
  return 'truyện tranh';
}

function genreLabels(tags) {
  const blocked = new Set([
    'manhwa',
    'manhua',
    'manga',
    'truyen-han',
    'truyen-trung',
    'truyen-nhat',
    'han-quoc',
    'trung-quoc',
    'nhat-ban'
  ]);
  const labels = [];
  for (const tag of tags) {
    if (blocked.has(tag.slug)) continue;
    if (!tag.name || /^truyện\s+(hàn|trung|nhật)/i.test(tag.name)) continue;
    if (!labels.some((label) => label.toLowerCase() === tag.name.toLowerCase())) labels.push(tag.name);
  }
  return labels;
}

function publicChapterCount(chapters) {
  return chapters.filter((chapter) => !chapter.status || chapter.status === 'public').length;
}

function smartTrim(value, maxLength) {
  const text = cleanText(value);
  if (text.length <= maxLength) return text;
  const trimmed = text.slice(0, maxLength - 1);
  const boundary = Math.max(trimmed.lastIndexOf('.'), trimmed.lastIndexOf(','), trimmed.lastIndexOf(' '));
  if (boundary > 80) return `${trimmed.slice(0, boundary).trimEnd()}.`;
  return `${trimmed.trimEnd()}.`;
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runSeoMetadataBackfill()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => closePostgresPool());
}
