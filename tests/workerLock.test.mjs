import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const lockPath = path.join(os.tmpdir(), `comic-reader-worker-${process.pid}.lock`);
process.env.CRAWL_WORKER_LOCK_PATH = lockPath;

const { acquireWorkerLock } = await import('../server/crawlWorker.mjs');

test.beforeEach(async () => {
  await fs.rm(lockPath, { force: true });
});

test.afterEach(async () => {
  await fs.rm(lockPath, { force: true });
});

test('acquireWorkerLock allows only one active worker at a time', async () => {
  const first = await acquireWorkerLock('worker-a');
  assert.ok(first);

  const second = await acquireWorkerLock('worker-b');
  assert.equal(second, null);

  await first.release();

  const third = await acquireWorkerLock('worker-b');
  assert.ok(third);
  await third.release();
});

test('acquireWorkerLock replaces a lock owned by a dead process', async () => {
  await fs.writeFile(lockPath, JSON.stringify({
    workerId: 'dead-worker',
    pid: 99_999_999,
    startedAt: new Date().toISOString()
  }));

  const lock = await acquireWorkerLock('worker-after-crash');
  assert.ok(lock);
  await lock.release();
});
