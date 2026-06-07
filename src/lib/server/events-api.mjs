import { appendAnalyticsEvent } from '../../../server/analyticsStore.mjs';
import { recordStoredEvent } from '../../../server/contentStore.mjs';

export async function nextEventsApi(request) {
  if (request.method !== 'POST') {
    return { status: 405, body: { error: 'Method not allowed' } };
  }

  try {
    const event = await appendAnalyticsEvent(await readJsonBody(request));
    const result = event.seriesSlug ? await recordStoredEvent(event) : { series: null };
    return {
      status: 202,
      body: {
        ok: true,
        stats: result.series?.stats || null
      }
    };
  } catch (error) {
    return {
      status: error.status || 500,
      body: { error: error.message || 'Không thể ghi analytics event.' }
    };
  }
}

async function readJsonBody(request) {
  const raw = await request.text();
  return raw.trim() ? JSON.parse(raw) : {};
}
