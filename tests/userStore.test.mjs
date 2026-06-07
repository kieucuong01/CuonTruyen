import test from 'node:test';
import assert from 'node:assert/strict';

const {
  authenticateGoogleUser,
  getSessionUser,
  loginUser,
  logoutUser,
  readUserStore,
  registerUser
} = await import(`../server/userStore.mjs?test=${Date.now()}`);
const {
  ensurePostgresSchema,
  queryPostgres
} = await import('../server/postgresStore.mjs');

test.beforeEach(async () => {
  await ensurePostgresSchema();
  await queryPostgres(
    `delete from app_users
     where identifier = any($1::text[])
        or password_hash = any($2::text[])`,
    [
      ['cuong@example.com', 'reader@example.com', 'googleuser@example.com'],
      ['oauth:google:google-subject-1', 'oauth:google:google-subject-2']
    ]
  );
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

test('authenticateGoogleUser creates a session for a verified Google email', async () => {
  const session = await authenticateGoogleUser({
    email: 'GoogleUser@example.com',
    emailVerified: true,
    name: 'Google User',
    sub: 'google-subject-1'
  });
  const store = await readUserStore();

  assert.equal(session.identifier, 'googleuser@example.com');
  assert.equal(session.displayName, 'Google User');
  assert.equal(Boolean(session.token), true);
  assert.equal(store.users.length, 1);
  assert.match(store.users[0].passwordHash, /^oauth:google:/);
});

test('authenticateGoogleUser links an existing password account without breaking password login', async () => {
  await registerUser({ identifier: 'reader@example.com', password: 'secret123', displayName: 'Reader' });

  const googleSession = await authenticateGoogleUser({
    email: 'reader@example.com',
    emailVerified: true,
    name: 'Reader Google',
    sub: 'google-subject-2'
  });
  const passwordSession = await loginUser({ identifier: 'reader@example.com', password: 'secret123' });
  const store = await readUserStore();

  assert.equal(googleSession.id, passwordSession.id);
  assert.equal(store.users.length, 1);
  assert.match(store.users[0].passwordHash, /^scrypt:/);
});
