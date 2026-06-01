const DEFAULT_WINDOW_MS = 60_000;

function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function createRateLimiter({ windowMs = DEFAULT_WINDOW_MS, max = 60, now = () => Date.now() } = {}) {
  const buckets = new Map();

  return {
    check(key) {
      const currentTime = now();
      const bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= currentTime) {
        const fresh = { count: 1, resetAt: currentTime + windowMs };
        buckets.set(key, fresh);
        return {
          allowed: true,
          remaining: Math.max(0, max - fresh.count),
          retryAfterSeconds: 0,
          resetAt: fresh.resetAt
        };
      }

      bucket.count += 1;
      const allowed = bucket.count <= max;
      return {
        allowed,
        remaining: Math.max(0, max - bucket.count),
        retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((bucket.resetAt - currentTime) / 1000)),
        resetAt: bucket.resetAt
      };
    },
    reset() {
      buckets.clear();
    }
  };
}

const adminLimiter = createRateLimiter({
  windowMs: numberFromEnv('RATE_LIMIT_WINDOW_MS', DEFAULT_WINDOW_MS),
  max: numberFromEnv('RATE_LIMIT_ADMIN_MAX', 60)
});

const eventsLimiter = createRateLimiter({
  windowMs: numberFromEnv('RATE_LIMIT_WINDOW_MS', DEFAULT_WINDOW_MS),
  max: numberFromEnv('RATE_LIMIT_EVENTS_MAX', 240)
});

export function isRateLimitedPath(pathname = '') {
  return pathname === '/api/import'
    || pathname === '/api/events'
    || pathname.startsWith('/api/admin/');
}

export function rateLimitBucket(pathname = '') {
  return pathname === '/api/events' ? 'events' : 'admin';
}

export function clientIp(req = {}) {
  const forwarded = req.headers?.['x-forwarded-for'] || req.headers?.['X-Forwarded-For'] || '';
  const firstForwarded = String(forwarded).split(',')[0].trim();
  return req.headers?.['cf-connecting-ip']
    || req.headers?.['x-real-ip']
    || firstForwarded
    || req.socket?.remoteAddress
    || 'local';
}

export function checkApiRateLimit(req, pathname) {
  if (!isRateLimitedPath(pathname)) return { allowed: true };
  const bucket = rateLimitBucket(pathname);
  const limiter = bucket === 'events' ? eventsLimiter : adminLimiter;
  return {
    bucket,
    ...limiter.check(`${bucket}:${clientIp(req)}`)
  };
}
