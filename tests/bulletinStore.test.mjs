import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const STORE_PATH = path.join(process.cwd(), '.tmp', `bulletin-test-${process.pid}.json`);
process.env.BULLETIN_STORE_PATH = STORE_PATH;

const {
  createAdminBulletinMessage,
  createUserBulletinMessage,
  listBulletinMessages,
  setAdminBulletinPinned
} = await import(`../server/bulletinStore.mjs?test=${Date.now()}`);

test.beforeEach(async () => {
  await fs.rm(STORE_PATH, { force: true });
});

test.after(async () => {
  await fs.rm(STORE_PATH, { force: true });
});

test('bulletin messages list pinned admin messages before recent chat', async () => {
  const userMessage = await createUserBulletinMessage({
    text: 'Có ai đọc bộ này chưa?',
    user: { id: 'user_1', displayName: 'Cuong', identifier: 'cuong@example.com' },
    now: '2026-06-04T02:00:00.000Z'
  });
  const adminMessage = await createAdminBulletinMessage({
    text: 'Lịch crawl tối nay có thêm chương mới.',
    adminEmail: 'admin@example.com',
    pinned: true,
    now: '2026-06-04T01:00:00.000Z'
  });

  const messages = await listBulletinMessages();

  assert.deepEqual(messages.map((message) => message.id), [adminMessage.id, userMessage.id]);
  assert.equal(messages[0].authorRole, 'admin');
  assert.equal(messages[0].pinned, true);
});

test('only admin messages can be pinned', async () => {
  const userMessage = await createUserBulletinMessage({
    text: 'Tin user không được ghim.',
    user: { id: 'user_1', displayName: 'Cuong', identifier: 'cuong@example.com' }
  });

  await assert.rejects(
    () => setAdminBulletinPinned(userMessage.id, true),
    /Chỉ tin nhắn admin mới được ghim/
  );
});
