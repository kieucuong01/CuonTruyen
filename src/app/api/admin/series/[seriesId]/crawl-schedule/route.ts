import { adminJsonApi, nextAdminContentCrawlScheduleApi } from '@/lib/server/admin-content-api.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ seriesId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { seriesId } = await context.params;
  return adminJsonApi(await nextAdminContentCrawlScheduleApi(request, seriesId));
}
