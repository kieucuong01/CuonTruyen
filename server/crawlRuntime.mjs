export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms || 0))));
}

export async function retryOperation(operation, {
  retries = 2,
  delayMs = 350,
  sleepFn = sleep,
  onRetry = () => {}
} = {}) {
  let lastError;
  const maxRetries = Math.max(0, Number(retries || 0));
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await operation({ attempt: attempt + 1 });
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries) break;
      const nextDelayMs = Number(delayMs || 0) * (attempt + 1);
      await onRetry({
        attempt: attempt + 1,
        error: error.message || String(error),
        nextDelayMs
      });
      await sleepFn(nextDelayMs);
    }
  }
  throw lastError;
}

export class DomainRateLimiter {
  constructor({
    minDelayMs = Number(process.env.CRAWL_DOMAIN_DELAY_MS || 650),
    sleep: sleepImpl = sleep,
    now = () => Date.now()
  } = {}) {
    this.minDelayMs = Math.max(0, Number(minDelayMs || 0));
    this.sleep = sleepImpl;
    this.now = now;
    this.lastByHost = new Map();
  }

  async wait(url) {
    if (!this.minDelayMs) return;
    const hostname = hostnameForUrl(url);
    if (!hostname) return;
    const lastAt = this.lastByHost.get(hostname);
    const current = this.now();
    if (lastAt !== undefined) {
      const elapsed = current - lastAt;
      const waitMs = this.minDelayMs - elapsed;
      if (waitMs > 0) await this.sleep(waitMs);
    }
    this.lastByHost.set(hostname, this.now());
  }
}

function hostnameForUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
