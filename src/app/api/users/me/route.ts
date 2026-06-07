import { nodeApiHandlerAsNext } from '@/lib/server/node-api-adapter.mjs';
import { handleMe, withUserApi } from '../../../../../server/userApi.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handler = withUserApi(handleMe);

export async function GET(request: Request) {
  return nodeApiHandlerAsNext(handler, request);
}

export async function OPTIONS(request: Request) {
  return nodeApiHandlerAsNext(handler, request);
}
