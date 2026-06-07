import { publicJsonApi } from '@/lib/server/api-response';
import { nextPublicSearchApi } from '@/lib/server/public-api.mjs';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  return publicJsonApi(await nextPublicSearchApi(url.searchParams.get('q') || ''));
}
