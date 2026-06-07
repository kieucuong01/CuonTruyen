import { nodeApiHandlerAsNext } from '@/lib/server/node-api-adapter.mjs';
import { handleAdminBulletinMessages, withAdminBulletinApi } from '../../../../../../server/bulletinApi.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handler = withAdminBulletinApi(handleAdminBulletinMessages);

export async function GET(request: Request) {
  return nodeApiHandlerAsNext(handler, request);
}

export async function POST(request: Request) {
  return nodeApiHandlerAsNext(handler, request);
}

export async function OPTIONS(request: Request) {
  return nodeApiHandlerAsNext(handler, request);
}
