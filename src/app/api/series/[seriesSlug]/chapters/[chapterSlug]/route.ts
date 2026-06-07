import { publicJsonApi } from '@/lib/server/api-response';
import { nextPublicReaderApi } from '@/lib/server/public-api.mjs';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ seriesSlug: string; chapterSlug: string }> }) {
  const { seriesSlug, chapterSlug } = await params;
  const url = new URL(request.url);
  return publicJsonApi(await nextPublicReaderApi({
    seriesSlug,
    chapterSlug,
    window: Number(url.searchParams.get('window') || 0)
  }));
}
