import { publicJsonApi } from '@/lib/server/api-response';
import { nextPublicTagApi } from '@/lib/server/public-api.mjs';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ tagSlug: string }> }) {
  const { tagSlug } = await params;
  return publicJsonApi(await nextPublicTagApi(tagSlug));
}
