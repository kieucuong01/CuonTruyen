import { NextResponse } from 'next/server';

type ApiResult = {
  status?: number;
  body: unknown;
};

const DEFAULT_PUBLIC_REVALIDATE_SECONDS = 300;

function publicCacheControl(revalidateSeconds = DEFAULT_PUBLIC_REVALIDATE_SECONDS) {
  return `public, s-maxage=${revalidateSeconds}, stale-while-revalidate=${revalidateSeconds * 2}`;
}

export function jsonApi({ status = 200, body }: ApiResult) {
  return NextResponse.json(body, {
    status,
    headers: {
      'cache-control': 'no-store'
    }
  });
}

export function publicJsonApi(
  { status = 200, body }: ApiResult,
  { revalidateSeconds = DEFAULT_PUBLIC_REVALIDATE_SECONDS } = {}
) {
  const cacheControl = status >= 200 && status < 300
    ? publicCacheControl(revalidateSeconds)
    : 'no-store';

  return NextResponse.json(body, {
    status,
    headers: {
      'cache-control': cacheControl
    }
  });
}
