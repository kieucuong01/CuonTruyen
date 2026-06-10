import test from 'node:test';
import assert from 'node:assert/strict';

const {
  createAdminBulletinMessage,
  createUserBulletinMessage,
  listBulletinMessages,
  setAdminBulletinPinned
} = await import(`../server/bulletinStore.mjs?test=${Date.now()}`);
const {
  ensurePostgresSchema,
  queryPostgres
} = await import('../server/postgresStore.mjs');

test.beforeEach(async () => {
  await ensurePostgresSchema();
  await queryPostgres(
    `delete from bulletin_messages
     where author_id = any($1::text[])
        or text = any($2::text[])`,
    [
      ['user_1', 'admin@example.com'],
      [
        'Có ai đọc bộ này chưa?',
        'Lịch crawl tối nay có thêm chương mới.',
        'Tin user không được ghim.'
      ]
    ]
  );
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

  const ids = new Set([adminMessage.id, userMessage.id]);
  const messages = (await listBulletinMessages()).filter((message) => ids.has(message.id));

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
