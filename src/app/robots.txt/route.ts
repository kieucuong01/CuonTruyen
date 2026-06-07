import { nextRobotsTxt } from '@/lib/server/seo-files.mjs';

export const dynamic = 'force-dynamic';

export async function GET() {
  return new Response(await nextRobotsTxt(), {
    headers: {
      'cache-control': 'public, s-maxage=300, stale-while-revalidate=600',
      'content-type': 'text/plain; charset=utf-8'
    }
  });
}
