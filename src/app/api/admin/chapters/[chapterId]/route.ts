import { adminJsonApi, nextAdminContentUpdateChapterApi } from '@/lib/server/admin-content-api.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ chapterId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { chapterId } = await context.params;
  return adminJsonApi(await nextAdminContentUpdateChapterApi(request, chapterId));
}
