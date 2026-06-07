import { nodeApiHandlerAsNext } from '@/lib/server/node-api-adapter.mjs';
import { handleAdminBulletinMessage, withAdminBulletinApi } from '../../../../../../../server/bulletinApi.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handler = withAdminBulletinApi(handleAdminBulletinMessage);

type RouteContext = {
  params: Promise<{ messageId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  return nodeApiHandlerAsNext(handler, request, {
    params: await context.params
  });
}

export async function OPTIONS(request: Request, context: RouteContext) {
  return nodeApiHandlerAsNext(handler, request, {
    params: await context.params
  });
}
