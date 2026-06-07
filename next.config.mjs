/** @type {import('next').NextConfig} */
const publicCacheControl = 'public, s-maxage=300, stale-while-revalidate=600';

function imageRemotePatterns() {
  const patterns = [
    { protocol: 'https', hostname: 's3.vn-hcm-1.vietnix.cloud' },
    { protocol: 'https', hostname: 'truyenqqko.com' }
  ];

  for (const value of [process.env.PUBLIC_IMPORTS_BASE_URL, process.env.NEXT_PUBLIC_IMPORTS_BASE_URL]) {
    try {
      const url = new URL(String(value || ''));
      const protocol = url.protocol.replace(/:$/, '');
      if ((protocol === 'http' || protocol === 'https') && url.hostname) {
        patterns.push({ protocol, hostname: url.hostname });
      }
    } catch {
      // Ignore unset or local relative image bases.
    }
  }

  const seen = new Set();
  return patterns.filter((pattern) => {
    const key = `${pattern.protocol}:${pattern.hostname}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['pg', 'sharp'],
  images: {
    remotePatterns: imageRemotePatterns()
  },
  async headers() {
    return [
      {
        source: '/',
        headers: [{ key: 'Cache-Control', value: publicCacheControl }]
      },
      {
        source: '/truyen/:path*',
        headers: [{ key: 'Cache-Control', value: publicCacheControl }]
      },
      {
        source: '/the-loai/:path*',
        headers: [{ key: 'Cache-Control', value: publicCacheControl }]
      },
      {
        source: '/gioi-thieu',
        headers: [{ key: 'Cache-Control', value: publicCacheControl }]
      },
      {
        source: '/lien-he',
        headers: [{ key: 'Cache-Control', value: publicCacheControl }]
      },
      {
        source: '/chinh-sach-noi-dung',
        headers: [{ key: 'Cache-Control', value: publicCacheControl }]
      },
      {
        source: '/privacy',
        headers: [{ key: 'Cache-Control', value: publicCacheControl }]
      }
    ];
  }
};

export default nextConfig;
