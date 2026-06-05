import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { ensurePostgresSchema, queryPostgres, usesPostgresStorage } from './postgresStore.mjs';

const ROOT = process.cwd();
const USER_STORE_PATH = path.resolve(process.env.USER_STORE_PATH || path.join(ROOT, 'data', 'users.json'));
const SESSION_TTL_MS = Number(process.env.USER_SESSION_TTL_MS || 1000 * 60 * 60 * 24 * 30);
const SCRYPT_KEY_LENGTH = 32;
let writeQueue = Promise.resolve();
let libSqlClientPromise = null;
let libSqlSchemaPromise = null;

export function usesLibSqlUserStore() {
  return Boolean(libSqlDatabaseUrl());
}

export function usesPostgresUserStore() {
  return usesPostgresStorage();
}

export async function readUserStore() {
  if (usesPostgresUserStore()) return readPostgresUserStore();
  if (usesLibSqlUserStore()) return readLibSqlUserStore();
  return readJsonUserStore();
}

export function normalizeUserIdentifier(value = '') {
  return String(value).trim().toLowerCase();
}

export async function registerUser({ identifier, password, displayName } = {}) {
  const normalized = normalizeUserIdentifier(identifier);
  assertValidCredentials(normalized, password);
  assertPersistentUserStore();
  if (usesPostgresUserStore()) return registerPostgresUser({ identifier: normalized, password, displayName });
  if (usesLibSqlUserStore()) return registerLibSqlUser({ identifier: normalized, password, displayName });

  const store = await readJsonUserStore();
  if (findUser(store, normalized)) {
    throw Object.assign(new Error('Tài khoản đã tồn tại.'), { status: 409 });
  }

  const now = new Date().toISOString();
  const user = {
    id: createUserId(normalized),
    identifier: normalized,
    displayName: String(displayName || displayNameFromIdentifier(normalized)).trim(),
    passwordHash: await hashPassword(password),
    createdAt: now,
    updatedAt: now
  };
  store.users.push(user);
  const session = await createSessionForUser(store, user);
  await writeJsonUserStore(store);
  return publicSession(user, session.token);
}

export async function loginUser({ identifier, password } = {}) {
  const normalized = normalizeUserIdentifier(identifier);
  if (!normalized || !password) {
    throw Object.assign(new Error('Vui lòng nhập email/tên đăng nhập và mật khẩu.'), { status: 400 });
  }
  assertPersistentUserStore();
  if (usesPostgresUserStore()) return loginPostgresUser({ identifier: normalized, password });
  if (usesLibSqlUserStore()) return loginLibSqlUser({ identifier: normalized, password });

  const store = await readJsonUserStore();
  const user = findUser(store, normalized);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw Object.assign(new Error('Tài khoản hoặc mật khẩu không đúng.'), { status: 401 });
  }

  user.updatedAt = new Date().toISOString();
  const session = await createSessionForUser(store, user);
  await writeJsonUserStore(store);
  return publicSession(user, session.token);
}

export async function authenticateGoogleUser({ email, emailVerified, name, sub } = {}) {
  const normalized = normalizeUserIdentifier(email);
  if (!normalized || !sub) {
    throw Object.assign(new Error('Google không trả đủ thông tin tài khoản.'), { status: 400 });
  }
  if (!emailVerified) {
    throw Object.assign(new Error('Email Google chưa được xác minh.'), { status: 401 });
  }
  assertPersistentUserStore();
  if (usesPostgresUserStore()) return authenticatePostgresGoogleUser({ email: normalized, name, sub });
  if (usesLibSqlUserStore()) return authenticateLibSqlGoogleUser({ email: normalized, name, sub });

  const store = await readJsonUserStore();
  const now = new Date().toISOString();
  let user = findUser(store, normalized);
  if (user) {
    user.displayName = String(user.displayName || name || displayNameFromIdentifier(normalized)).trim();
    user.updatedAt = now;
  } else {
    user = {
      id: createUserId(normalized),
      identifier: normalized,
      displayName: String(name || displayNameFromIdentifier(normalized)).trim(),
      passwordHash: `oauth:google:${String(sub)}`,
      createdAt: now,
      updatedAt: now
    };
    store.users.push(user);
  }
  const session = await createSessionForUser(store, user);
  await writeJsonUserStore(store);
  return publicSession(user, session.token);
}

export async function getSessionUser(token = '') {
  const rawToken = String(token || '').trim();
  if (!rawToken) return null;
  assertPersistentUserStore();
  if (usesPostgresUserStore()) return getPostgresSessionUser(rawToken);
  if (usesLibSqlUserStore()) return getLibSqlSessionUser(rawToken);

  const store = await readJsonUserStore();
  const tokenHash = hashToken(rawToken);
  const now = Date.now();
  const session = store.sessions.find((item) => item.tokenHash === tokenHash && Date.parse(item.expiresAt) > now);
  if (!session) return null;
  const user = store.users.find((item) => item.id === session.userId);
  return user ? publicUser(user) : null;
}

export async function logoutUser(token = '') {
  const rawToken = String(token || '').trim();
  if (!rawToken) return { ok: true };
  assertPersistentUserStore();
  if (usesPostgresUserStore()) return logoutPostgresUser(rawToken);
  if (usesLibSqlUserStore()) return logoutLibSqlUser(rawToken);

  const store = await readJsonUserStore();
  const tokenHash = hashToken(rawToken);
  store.sessions = store.sessions.filter((session) => session.tokenHash !== tokenHash);
  await writeJsonUserStore(store);
  return { ok: true };
}

export function extractUserToken(headers = {}) {
  const direct = headers['x-user-token'] || headers['X-User-Token'];
  if (direct) return String(direct);
  const authorization = headers.authorization || headers.Authorization || '';
  const match = String(authorization).match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : '';
}

async function readJsonUserStore() {
  try {
    const value = JSON.parse(await fs.readFile(USER_STORE_PATH, 'utf8'));
    return normalizeStore(value);
  } catch (error) {
    if (error.code === 'ENOENT') return { users: [], sessions: [] };
    throw error;
  }
}

function writeJsonUserStore(store) {
  const pending = writeQueue.then(() => writeJsonUserStoreNow(store));
  writeQueue = pending.catch(() => {});
  return pending;
}

async function writeJsonUserStoreNow(store) {
  await fs.mkdir(path.dirname(USER_STORE_PATH), { recursive: true });
  const tempPath = `${USER_STORE_PATH}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  await fs.rename(tempPath, USER_STORE_PATH);
}

function normalizeStore(value = {}) {
  return {
    users: Array.isArray(value.users) ? value.users : [],
    sessions: Array.isArray(value.sessions) ? value.sessions : []
  };
}

async function registerPostgresUser({ identifier, password, displayName }) {
  await ensurePostgresSchema();
  const existing = await getPostgresUserByIdentifier(identifier);
  if (existing) throw Object.assign(new Error('Tài khoản đã tồn tại.'), { status: 409 });

  const now = new Date().toISOString();
  const user = {
    id: createUserId(identifier),
    identifier,
    displayName: String(displayName || displayNameFromIdentifier(identifier)).trim(),
    passwordHash: await hashPassword(password),
    createdAt: now,
    updatedAt: now
  };
  await queryPostgres(
    `insert into app_users (id, identifier, display_name, password_hash, created_at, updated_at)
     values ($1, $2, $3, $4, $5, $6)`,
    [user.id, user.identifier, user.displayName, user.passwordHash, user.createdAt, user.updatedAt]
  );
  const session = await createPostgresSession(user.id);
  return publicSession(user, session.token);
}

async function loginPostgresUser({ identifier, password }) {
  await ensurePostgresSchema();
  const user = await getPostgresUserByIdentifier(identifier);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw Object.assign(new Error('Tài khoản hoặc mật khẩu không đúng.'), { status: 401 });
  }

  const updatedAt = new Date().toISOString();
  await queryPostgres('update app_users set updated_at = $1 where id = $2', [updatedAt, user.id]);
  user.updatedAt = updatedAt;
  const session = await createPostgresSession(user.id);
  return publicSession(user, session.token);
}

async function authenticatePostgresGoogleUser({ email, name, sub }) {
  await ensurePostgresSchema();
  const now = new Date().toISOString();
  let user = await getPostgresUserByIdentifier(email);
  if (user) {
    user.displayName = String(user.displayName || name || displayNameFromIdentifier(email)).trim();
    user.updatedAt = now;
    await queryPostgres(
      'update app_users set display_name = $1, updated_at = $2 where id = $3',
      [user.displayName, user.updatedAt, user.id]
    );
  } else {
    user = {
      id: createUserId(email),
      identifier: email,
      displayName: String(name || displayNameFromIdentifier(email)).trim(),
      passwordHash: `oauth:google:${String(sub)}`,
      createdAt: now,
      updatedAt: now
    };
    await queryPostgres(
      `insert into app_users (id, identifier, display_name, password_hash, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6)`,
      [user.id, user.identifier, user.displayName, user.passwordHash, user.createdAt, user.updatedAt]
    );
  }
  const session = await createPostgresSession(user.id);
  return publicSession(user, session.token);
}

async function getPostgresSessionUser(token) {
  await ensurePostgresSchema();
  const result = await queryPostgres(
    `select u.id, u.identifier, u.display_name, u.created_at, u.updated_at
     from app_sessions s
     join app_users u on u.id = s.user_id
     where s.token_hash = $1 and s.expires_at > $2
     limit 1`,
    [hashToken(token), new Date().toISOString()]
  );
  const row = result.rows[0];
  return row ? publicUser(userFromPostgresRow(row)) : null;
}

async function logoutPostgresUser(token) {
  await ensurePostgresSchema();
  await queryPostgres('delete from app_sessions where token_hash = $1', [hashToken(token)]);
  return { ok: true };
}

async function readPostgresUserStore() {
  await ensurePostgresSchema();
  const [usersResult, sessionsResult] = await Promise.all([
    queryPostgres('select * from app_users order by created_at'),
    queryPostgres('select * from app_sessions order by created_at')
  ]);
  return {
    users: usersResult.rows.map(userFromPostgresRow),
    sessions: sessionsResult.rows.map(sessionFromPostgresRow)
  };
}

async function getPostgresUserByIdentifier(identifier) {
  const result = await queryPostgres('select * from app_users where identifier = $1 limit 1', [identifier]);
  return result.rows[0] ? userFromPostgresRow(result.rows[0]) : null;
}

async function createPostgresSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const session = {
    userId,
    tokenHash: hashToken(token),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString()
  };
  await queryPostgres('delete from app_sessions where expires_at <= $1', [new Date(now).toISOString()]);
  await queryPostgres(
    'insert into app_sessions (token_hash, user_id, created_at, expires_at) values ($1, $2, $3, $4)',
    [session.tokenHash, session.userId, session.createdAt, session.expiresAt]
  );
  return { ...session, token };
}

async function registerLibSqlUser({ identifier, password, displayName }) {
  await ensureLibSqlSchema();
  const client = await getLibSqlClient();
  const existing = await getLibSqlUserByIdentifier(identifier);
  if (existing) throw Object.assign(new Error('Tài khoản đã tồn tại.'), { status: 409 });

  const now = new Date().toISOString();
  const user = {
    id: createUserId(identifier),
    identifier,
    displayName: String(displayName || displayNameFromIdentifier(identifier)).trim(),
    passwordHash: await hashPassword(password),
    createdAt: now,
    updatedAt: now
  };
  await client.execute({
    sql: `insert into users (id, identifier, display_name, password_hash, created_at, updated_at)
          values (?, ?, ?, ?, ?, ?)`,
    args: [user.id, user.identifier, user.displayName, user.passwordHash, user.createdAt, user.updatedAt]
  });
  const session = await createLibSqlSession(user.id);
  return publicSession(user, session.token);
}

async function loginLibSqlUser({ identifier, password }) {
  await ensureLibSqlSchema();
  const user = await getLibSqlUserByIdentifier(identifier);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw Object.assign(new Error('Tài khoản hoặc mật khẩu không đúng.'), { status: 401 });
  }

  const updatedAt = new Date().toISOString();
  const client = await getLibSqlClient();
  await client.execute({ sql: 'update users set updated_at = ? where id = ?', args: [updatedAt, user.id] });
  user.updatedAt = updatedAt;
  const session = await createLibSqlSession(user.id);
  return publicSession(user, session.token);
}

async function authenticateLibSqlGoogleUser({ email, name, sub }) {
  await ensureLibSqlSchema();
  const now = new Date().toISOString();
  const client = await getLibSqlClient();
  let user = await getLibSqlUserByIdentifier(email);
  if (user) {
    user.displayName = String(user.displayName || name || displayNameFromIdentifier(email)).trim();
    user.updatedAt = now;
    await client.execute({
      sql: 'update users set display_name = ?, updated_at = ? where id = ?',
      args: [user.displayName, user.updatedAt, user.id]
    });
  } else {
    user = {
      id: createUserId(email),
      identifier: email,
      displayName: String(name || displayNameFromIdentifier(email)).trim(),
      passwordHash: `oauth:google:${String(sub)}`,
      createdAt: now,
      updatedAt: now
    };
    await client.execute({
      sql: `insert into users (id, identifier, display_name, password_hash, created_at, updated_at)
            values (?, ?, ?, ?, ?, ?)`,
      args: [user.id, user.identifier, user.displayName, user.passwordHash, user.createdAt, user.updatedAt]
    });
  }
  const session = await createLibSqlSession(user.id);
  return publicSession(user, session.token);
}

async function getLibSqlSessionUser(token) {
  await ensureLibSqlSchema();
  const client = await getLibSqlClient();
  const result = await client.execute({
    sql: `select u.id, u.identifier, u.display_name, u.created_at, u.updated_at
          from sessions s
          join users u on u.id = s.user_id
          where s.token_hash = ? and s.expires_at > ?
          limit 1`,
    args: [hashToken(token), new Date().toISOString()]
  });
  const row = result.rows[0];
  return row ? publicUser(userFromLibSqlRow(row)) : null;
}

async function logoutLibSqlUser(token) {
  await ensureLibSqlSchema();
  const client = await getLibSqlClient();
  await client.execute({ sql: 'delete from sessions where token_hash = ?', args: [hashToken(token)] });
  return { ok: true };
}

async function readLibSqlUserStore() {
  await ensureLibSqlSchema();
  const client = await getLibSqlClient();
  const [usersResult, sessionsResult] = await Promise.all([
    client.execute('select * from users order by created_at'),
    client.execute('select * from sessions order by created_at')
  ]);
  return {
    users: usersResult.rows.map(userFromLibSqlRow),
    sessions: sessionsResult.rows.map(sessionFromLibSqlRow)
  };
}

async function getLibSqlUserByIdentifier(identifier) {
  const client = await getLibSqlClient();
  const result = await client.execute({
    sql: 'select * from users where identifier = ? limit 1',
    args: [identifier]
  });
  return result.rows[0] ? userFromLibSqlRow(result.rows[0]) : null;
}

async function createLibSqlSession(userId) {
  const client = await getLibSqlClient();
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const session = {
    userId,
    tokenHash: hashToken(token),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString()
  };
  await client.batch([
    {
      sql: 'delete from sessions where expires_at <= ?',
      args: [new Date(now).toISOString()]
    },
    {
      sql: 'insert into sessions (token_hash, user_id, created_at, expires_at) values (?, ?, ?, ?)',
      args: [session.tokenHash, session.userId, session.createdAt, session.expiresAt]
    }
  ]);
  return { ...session, token };
}

async function ensureLibSqlSchema() {
  if (!libSqlSchemaPromise) {
    libSqlSchemaPromise = (async () => {
      const client = await getLibSqlClient();
      await client.batch([
        `create table if not exists users (
          id text primary key,
          identifier text not null unique,
          display_name text not null,
          password_hash text not null,
          created_at text not null,
          updated_at text not null
        )`,
        `create table if not exists sessions (
          token_hash text primary key,
          user_id text not null references users(id) on delete cascade,
          created_at text not null,
          expires_at text not null
        )`,
        'create index if not exists idx_sessions_user_id on sessions(user_id)',
        'create index if not exists idx_sessions_expires_at on sessions(expires_at)'
      ]);
    })();
  }
  return libSqlSchemaPromise;
}

async function getLibSqlClient() {
  if (!libSqlClientPromise) {
    libSqlClientPromise = (async () => {
      const { createClient } = await import('@libsql/client');
      return createClient({
        url: libSqlDatabaseUrl(),
        authToken: libSqlAuthToken()
      });
    })();
  }
  return libSqlClientPromise;
}

function libSqlDatabaseUrl() {
  return process.env.LIBSQL_DATABASE_URL || process.env.TURSO_DATABASE_URL || '';
}

function libSqlAuthToken() {
  return process.env.LIBSQL_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN || '';
}

function assertPersistentUserStore() {
  if (usesPostgresUserStore()) return;
  if (usesLibSqlUserStore()) return;
  if (process.env.VERCEL) {
    throw Object.assign(
      new Error('User auth on Vercel requires DATABASE_URL/POSTGRES_URL for Supabase Postgres, or LIBSQL/TURSO env for legacy storage.'),
      { status: 503 }
    );
  }
}

function userFromPostgresRow(row = {}) {
  return {
    id: String(row.id || ''),
    identifier: String(row.identifier || ''),
    displayName: String(row.display_name ?? row.displayName ?? ''),
    passwordHash: String(row.password_hash ?? row.passwordHash ?? ''),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : ''
  };
}

function sessionFromPostgresRow(row = {}) {
  return {
    tokenHash: String(row.token_hash ?? row.tokenHash ?? ''),
    userId: String(row.user_id ?? row.userId ?? ''),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : ''
  };
}

function userFromLibSqlRow(row = {}) {
  return {
    id: String(row.id || ''),
    identifier: String(row.identifier || ''),
    displayName: String(row.display_name ?? row.displayName ?? ''),
    passwordHash: String(row.password_hash ?? row.passwordHash ?? ''),
    createdAt: String(row.created_at ?? row.createdAt ?? ''),
    updatedAt: String(row.updated_at ?? row.updatedAt ?? '')
  };
}

function sessionFromLibSqlRow(row = {}) {
  return {
    tokenHash: String(row.token_hash ?? row.tokenHash ?? ''),
    userId: String(row.user_id ?? row.userId ?? ''),
    createdAt: String(row.created_at ?? row.createdAt ?? ''),
    expiresAt: String(row.expires_at ?? row.expiresAt ?? '')
  };
}

function findUser(store, identifier) {
  return store.users.find((user) => normalizeUserIdentifier(user.identifier) === identifier) || null;
}

function assertValidCredentials(identifier, password) {
  if (!identifier) {
    throw Object.assign(new Error('Vui lòng nhập email hoặc tên đăng nhập.'), { status: 400 });
  }
  if (String(password || '').length < 6) {
    throw Object.assign(new Error('Mật khẩu cần ít nhất 6 ký tự.'), { status: 400 });
  }
}

function createUserId(identifier) {
  return `user_${crypto.createHash('sha256').update(identifier).digest('hex').slice(0, 16)}`;
}

function displayNameFromIdentifier(identifier) {
  const name = identifier.includes('@') ? identifier.split('@')[0] : identifier;
  return name
    .split(/[.\-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Reader';
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await scrypt(password, salt);
  return `scrypt:${salt}:${key.toString('hex')}`;
}

async function verifyPassword(password, stored = '') {
  const [, salt, expectedHex] = String(stored).split(':');
  if (!salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = await scrypt(password, salt);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function scrypt(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(password), salt, SCRYPT_KEY_LENGTH, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

async function createSessionForUser(store, user) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const session = {
    userId: user.id,
    tokenHash: hashToken(token),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString()
  };
  store.sessions = [
    session,
    ...store.sessions.filter((item) => Date.parse(item.expiresAt) > now)
  ];
  return { ...session, token };
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function publicUser(user) {
  return {
    id: user.id,
    identifier: user.identifier,
    displayName: user.displayName,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function publicSession(user, token) {
  return {
    ...publicUser(user),
    token
  };
}
