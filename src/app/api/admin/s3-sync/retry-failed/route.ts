import { adminJsonApi } from '@/lib/server/admin-content-api.mjs';
import { nextLocalPipelineUnavailableApi } from '@/lib/server/local-pipeline-api.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return adminJsonApi(await nextLocalPipelineUnavailableApi(request, 'Retry S3 sync'));
}
