import { adminJsonApi, nextAdminContentUpdateSeriesApi } from '@/lib/server/admin-content-api.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ seriesId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { seriesId } = await context.params;
  return adminJsonApi(await nextAdminContentUpdateSeriesApi(request, seriesId));
}
