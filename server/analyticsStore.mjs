import fs from 'node:fs/promises';
import path from 'node:path';

import { IMPORT_ROOT } from './catalogStore.mjs';

const EVENTS_PATH = path.join(IMPORT_ROOT, 'analytics-events.jsonl');

export async function appendAnalyticsEvent(event) {
  await fs.mkdir(IMPORT_ROOT, { recursive: true });
  const safeEvent = {
    type: event.type || 'event',
    seriesSlug: event.seriesSlug || event.seriesId || '',
    chapterSlug: event.chapterSlug || event.chapterId || '',
    value: Number(event.value || 0),
    url: event.url || '',
    at: event.at || new Date().toISOString()
  };
  await fs.appendFile(EVENTS_PATH, `${JSON.stringify(safeEvent)}\n`);
  return safeEvent;
}
