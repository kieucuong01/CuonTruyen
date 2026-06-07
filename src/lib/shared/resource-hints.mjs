const DEFAULT_PUBLIC_IMPORTS_ORIGIN = 'https://s3.vn-hcm-1.vietnix.cloud';

export function publicImportsOrigin(env = process.env) {
  const raw = String(
    env.PUBLIC_IMPORTS_BASE_URL
      || env.NEXT_PUBLIC_IMPORTS_BASE_URL
      || DEFAULT_PUBLIC_IMPORTS_ORIGIN
  ).trim();

  try {
    return new URL(raw).origin;
  } catch {
    return DEFAULT_PUBLIC_IMPORTS_ORIGIN;
  }
}
