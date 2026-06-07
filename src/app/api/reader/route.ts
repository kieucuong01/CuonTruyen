import { publicJsonApi } from '@/lib/server/api-response';
import { nextPublicReaderApi } from '@/lib/server/public-api.mjs';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  return publicJsonApi(await nextPublicReaderApi({
    seriesSlug: url.searchParams.get('series') || '',
    chapterSlug: url.searchParams.get('chapter') || '',
    window: Number(url.searchParams.get('window') || 0),
    start: url.searchParams.get('start') || 'current'
  }));
}
