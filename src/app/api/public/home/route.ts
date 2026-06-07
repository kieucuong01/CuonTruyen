import { publicJsonApi } from '@/lib/server/api-response';
import { nextPublicHomeApi } from '@/lib/server/public-api.mjs';

export const dynamic = 'force-dynamic';

export async function GET() {
  return publicJsonApi(await nextPublicHomeApi());
}
