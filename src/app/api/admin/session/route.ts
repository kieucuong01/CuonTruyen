import { jsonApi } from '@/lib/server/api-response';
import { nextAdminSessionApi } from '@/lib/server/admin-api.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return jsonApi(await nextAdminSessionApi(request));
}

export async function POST(request: Request) {
  return jsonApi(await nextAdminSessionApi(request));
}
