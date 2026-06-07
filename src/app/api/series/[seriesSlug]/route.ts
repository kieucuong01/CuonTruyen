import { publicJsonApi } from '@/lib/server/api-response';
import { nextPublicSeriesApi } from '@/lib/server/public-api.mjs';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ seriesSlug: string }> }) {
  const { seriesSlug } = await params;
  return publicJsonApi(await nextPublicSeriesApi(seriesSlug));
}
