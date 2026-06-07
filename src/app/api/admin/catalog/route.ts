import { adminJsonApi, nextAdminContentCatalogApi } from '@/lib/server/admin-content-api.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return adminJsonApi(await nextAdminContentCatalogApi(request));
}
