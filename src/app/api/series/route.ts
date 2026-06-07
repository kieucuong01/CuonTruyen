import { publicJsonApi } from '@/lib/server/api-response';
import { nextPublicCatalogApi, nextPublicSeriesApi } from '@/lib/server/public-api.mjs';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = String(url.searchParams.get('series') || url.searchParams.get('id') || '').trim();
  return publicJsonApi(id ? await nextPublicSeriesApi(id) : await nextPublicCatalogApi());
}
