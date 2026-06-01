import fs from 'node:fs/promises';
import path from 'node:path';

import { IMPORT_ROOT } from './catalogStore.mjs';

const EVENTS_PATH = path.join(IMPORT_ROOT, 'analytics-events.jsonl');

export function normalizeAnalyticsEvent(event = {}) {
  return {
    type: event.type || 'event',
    seriesSlug: event.seriesSlug || event.seriesId || '',
    chapterSlug: event.chapterSlug || event.chapterId || '',
    value: Number(event.value || 0),
    placement: event.placement || '',
    source: event.source || '',
    url: event.url || '',
    at: event.at || new Date().toISOString()
  };
}

export async function appendAnalyticsEvent(event) {
  await fs.mkdir(IMPORT_ROOT, { recursive: true });
  const safeEvent = normalizeAnalyticsEvent(event);
  await fs.appendFile(EVENTS_PATH, `${JSON.stringify(safeEvent)}\n`);
  return safeEvent;
}
