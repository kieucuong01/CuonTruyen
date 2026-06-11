const DEFAULT_ALLOWED_IMAGE_HOSTS = ['hinhhinh.com'];
const DEFAULT_REFERER_BY_HOST = [
  { suffix: 'hinhhinh.com', referer: 'https://truyenqqko.com/' },
  { suffix: 'truyenqqko.com', referer: 'https://truyenqqko.com/' },
  { suffix: 'truyenqqgo.com', referer: 'https://truyenqqgo.com/' }
];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function proxiedExternalImageUrl(value = '') {
  const imageUrl = String(value || '').trim();
  if (!shouldProxyExternalImageUrl(imageUrl)) return imageUrl;
  return `/api/image-proxy?url=${encodeURIComponent(imageUrl)}`;
}

export function shouldProxyExternalImageUrl(value = '', env = process.env) {
  let parsed;
  try {
    parsed = new URL(String(value || '').trim());
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return false;
  if (!/\.(jpe?g|png|webp|gif)(?:$|[?#])/i.test(parsed.pathname + parsed.search)) return false;
  return allowedImageHostSuffixes(env).some((suffix) => hostMatchesSuffix(parsed.hostname, suffix));
}

export async function handleImageProxyRequest(req, res, url) {
  const targetUrl = String(url.searchParams.get('url') || '').trim();
  if (!shouldProxyExternalImageUrl(targetUrl)) {
    imageProxyError(res, 400, 'Image proxy target is not allowed.');
    return true;
  }

  let parsedTarget;
  try {
    parsedTarget = new URL(targetUrl);
  } catch {
    imageProxyError(res, 400, 'Invalid image URL.');
    return true;
  }

  let response;
  try {
    response = await fetch(targetUrl, {
      headers: {
        accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'accept-language': 'vi,en-US;q=0.9,en;q=0.8',
        referer: refererForImageHost(parsedTarget.hostname),
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
      }
    });
  } catch (error) {
    imageProxyError(res, 502, `Image source fetch failed: ${error.message || String(error)}`);
    return true;
  }

  if (!response.ok) {
    imageProxyError(res, response.status, `Image source returned ${response.status}.`);
    return true;
  }

  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  if (!/^image\//i.test(contentType)) {
    imageProxyError(res, 415, 'Image source did not return an image.');
    return true;
  }

  const contentLength = Number(response.headers.get('content-length') || 0);
  const maxBytes = maxImageBytes();
  if (contentLength && contentLength > maxBytes) {
    imageProxyError(res, 413, 'Image is too large to proxy.');
    return true;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > maxBytes) {
    imageProxyError(res, 413, 'Image is too large to proxy.');
    return true;
  }

  const headers = {
    'content-type': contentType,
    'content-length': String(buffer.byteLength),
    'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
    'x-content-type-options': 'nosniff'
  };
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : buffer);
  return true;
}

function allowedImageHostSuffixes(env = process.env) {
  const configured = String(env.IMAGE_PROXY_ALLOWED_HOSTS || '').trim();
  const values = configured
    ? configured.split(',').map((item) => item.trim()).filter(Boolean)
    : DEFAULT_ALLOWED_IMAGE_HOSTS;
  return values.map((value) => value.replace(/^\*\./, '').toLowerCase());
}

function refererForImageHost(hostname = '') {
  const override = String(process.env.IMAGE_PROXY_REFERER || '').trim();
  if (override) return override;
  const normalizedHost = String(hostname || '').toLowerCase();
  return DEFAULT_REFERER_BY_HOST.find((entry) => hostMatchesSuffix(normalizedHost, entry.suffix))?.referer
    || `https://${normalizedHost}/`;
}

function hostMatchesSuffix(hostname = '', suffix = '') {
  const host = String(hostname || '').toLowerCase();
  const cleanSuffix = String(suffix || '').toLowerCase().replace(/^\*\./, '');
  return host === cleanSuffix || host.endsWith(`.${cleanSuffix}`);
}

function maxImageBytes() {
  const value = Number(process.env.IMAGE_PROXY_MAX_BYTES || MAX_IMAGE_BYTES);
  return Number.isFinite(value) && value > 0 ? value : MAX_IMAGE_BYTES;
}

function imageProxyError(res, status, message) {
  const body = Buffer.from(JSON.stringify({ error: message }));
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(body.byteLength),
    'cache-control': 'no-store'
  });
  res.end(body);
}
