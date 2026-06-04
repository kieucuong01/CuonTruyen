import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const STORE_PATH = path.join(process.cwd(), '.tmp', `users-test-${process.pid}.json`);
process.env.USER_STORE_PATH = STORE_PATH;

const {
  getSessionUser,
  loginUser,
  logoutUser,
  readUserStore,
  registerUser
} = await import(`../server/userStore.mjs?test=${Date.now()}`);

test.beforeEach(async () => {
  await fs.rm(STORE_PATH, { force: true });
});

test.after(async () => {
  await fs.rm(STORE_PATH, { force: true });
});

test('registerUser stores a password hash and returns a session token', async () => {
  const session = await registerUser({
    identifier: 'Cuong@example.com',
    password: 'secret123',
    displayName: 'Cuong'
  });
  const store = await readUserStore();

  assert.equal(session.identifier, 'cuong@example.com');
  assert.equal(Boolean(session.token), true);
  assert.equal(store.users.length, 1);
  assert.match(store.users[0].passwordHash, /^scrypt:/);
  assert.notEqual(store.users[0].passwordHash, 'secret123');
});

test('loginUser rejects the wrong password and accepts the right password', async () => {
  await registerUser({ identifier: 'reader@example.com', password: 'secret123' });

  await assert.rejects(
    () => loginUser({ identifier: 'reader@example.com', password: 'wrongpw' }),
    /Tài khoản hoặc mật khẩu không đúng/
  );

  const session = await loginUser({ identifier: 'reader@example.com', password: 'secret123' });
  assert.equal(session.identifier, 'reader@example.com');
  assert.equal(Boolean(session.token), true);
});

test('getSessionUser and logoutUser validate server-issued tokens', async () => {
  const session = await registerUser({ identifier: 'reader@example.com', password: 'secret123' });

  assert.equal((await getSessionUser(session.token)).id, session.id);
  await logoutUser(session.token);
  assert.equal(await getSessionUser(session.token), null);
});
