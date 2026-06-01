import test from 'node:test';
import assert from 'node:assert/strict';

import { DomainRateLimiter, retryOperation } from '../server/crawlRuntime.mjs';

test('retryOperation retries a failing image download before succeeding', async () => {
  const attempts = [];
  const retryEvents = [];

  const result = await retryOperation(
    async () => {
      attempts.push(Date.now());
      if (attempts.length < 3) throw new Error(`temporary ${attempts.length}`);
      return 'ok';
    },
    {
      retries: 2,
      delayMs: 0,
      onRetry: (event) => retryEvents.push(event)
    }
  );

  assert.equal(result, 'ok');
  assert.equal(attempts.length, 3);
  assert.deepEqual(retryEvents.map((event) => event.attempt), [1, 2]);
  assert.equal(retryEvents[0].error, 'temporary 1');
});

test('retryOperation throws the final error after retry budget is exhausted', async () => {
  let attempts = 0;

  await assert.rejects(
    () => retryOperation(
      async () => {
        attempts += 1;
        throw new Error('still blocked');
      },
      { retries: 1, delayMs: 0 }
    ),
    /still blocked/
  );

  assert.equal(attempts, 2);
});

test('DomainRateLimiter waits only between requests for the same hostname', async () => {
  let clock = 1_000;
  const sleeps = [];
  const limiter = new DomainRateLimiter({
    minDelayMs: 250,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    }
  });

  await limiter.wait('https://a.example.test/one');
  await limiter.wait('https://b.example.test/one');
  await limiter.wait('https://a.example.test/two');

  assert.deepEqual(sleeps, [250]);
});
