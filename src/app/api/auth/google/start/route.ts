import { nodeApiHandlerAsNext } from '@/lib/server/node-api-adapter.mjs';
import { handleGoogleStart, withGoogleAuthApi } from '../../../../../../server/googleAuthApi.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handler = withGoogleAuthApi(handleGoogleStart);

export async function GET(request: Request) {
  return nodeApiHandlerAsNext(handler, request);
}
