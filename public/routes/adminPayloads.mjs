import { mergeTagsWithOrigin } from './adminTags.mjs';

export function buildAdminImportPayload(formData, { splitList = defaultSplitList } = {}) {
  const urls = splitList(String(formData.get('url') || '').replace(/\r?\n/g, ','));
  return {
    urls,
    maxChapters: Number(formData.get('maxChapters') || 0),
    maxPages: Number(formData.get('maxPages') || 0),
    assetMode: formData.get('assetMode') || 'image_url',
    publish: true
  };
}

export function buildAdminSeriesPatch(formData, {
  splitList = defaultSplitList,
  localOps = false
} = {}) {
  const patch = {
    title: formData.get('title'),
    slug: formData.get('slug'),
    coverUrl: formData.get('coverUrl'),
    aliases: splitList(formData.get('aliases')),
    tags: mergeTagsWithOrigin(splitList(formData.get('tags')), formData.get('originType')),
    description: formData.get('description'),
    status: formData.get('status')
  };
  if (localOps) {
    patch.crawlSchedule = {
      enabled: formData.get('scheduleEnabled') === 'on',
      intervalHours: Number(formData.get('intervalHours') || 24)
    };
  }
  return patch;
}

export function buildAdminChapterPatch(formData, chapterId) {
  const title = formData.get(`chapterTitle:${chapterId}`);
  return {
    title,
    label: title,
    status: formData.get(`chapterStatus:${chapterId}`),
    takedownReason: formData.get(`chapterReason:${chapterId}`)
  };
}

function defaultSplitList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
