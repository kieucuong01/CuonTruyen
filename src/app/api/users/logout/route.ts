import { nodeApiHandlerAsNext } from '@/lib/server/node-api-adapter.mjs';
import { handleLogout, withUserApi } from '../../../../../server/userApi.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handler = withUserApi(handleLogout);

export async function POST(request: Request) {
  return nodeApiHandlerAsNext(handler, request);
}

export async function OPTIONS(request: Request) {
  return nodeApiHandlerAsNext(handler, request);
}
