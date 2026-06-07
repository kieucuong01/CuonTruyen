import { jsonApi } from '@/lib/server/api-response';
import { nextEventsApi } from '@/lib/server/events-api.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return jsonApi(await nextEventsApi(request));
}
