import { adminJsonApi, nextAdminContentUpdateSeriesChapterApi } from '@/lib/server/admin-content-api.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ seriesId: string; chapterId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { seriesId, chapterId } = await context.params;
  return adminJsonApi(await nextAdminContentUpdateSeriesChapterApi(request, seriesId, chapterId));
}
