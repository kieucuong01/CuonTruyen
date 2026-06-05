import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { ensurePostgresSchema, queryPostgres, usesPostgresStorage } from './postgresStore.mjs';

const ROOT = process.cwd();
const BULLETIN_STORE_PATH = path.resolve(process.env.BULLETIN_STORE_PATH || path.join(ROOT, 'data', 'bulletin-messages.json'));
const MAX_MESSAGES = Number(process.env.BULLETIN_MAX_MESSAGES || 200);
const MAX_TEXT_LENGTH = Number(process.env.BULLETIN_MAX_TEXT_LENGTH || 500);
let writeQueue = Promise.resolve();
let libSqlClientPromise = null;
let libSqlSchemaPromise = null;

export function usesLibSqlBulletinStore() {
  return Boolean(libSqlDatabaseUrl());
}

export function usesPostgresBulletinStore() {
  return usesPostgresStorage();
}

export async function listBulletinMessages({ limit = 30 } = {}) {
  if (usesPostgresBulletinStore()) return listPostgresBulletinMessages({ limit });
  if (usesLibSqlBulletinStore()) return listLibSqlBulletinMessages({ limit });
  const store = await readBulletinStore();
  return sortMessages(store.messages)
    .slice(0, Math.max(1, Number(limit || 30)))
    .map(publicMessage);
}

export async function createUserBulletinMessage({ text, user, now = new Date().toISOString() } = {}) {
  if (!user?.id) throw Object.assign(new Error('Bạn cần đăng nhập để gửi tin nhắn.'), { status: 401 });
  return appendMessage({
    text,
    now,
    authorRole: 'user',
    authorId: user.id,
    authorName: user.displayName || user.identifier || 'Reader'
  });
}

export async function createAdminBulletinMessage({ text, adminEmail, pinned = false, now = new Date().toISOString() } = {}) {
  return appendMessage({
    text,
    now,
    authorRole: 'admin',
    authorId: normalizeAdminId(adminEmail),
    authorName: 'Admin',
    pinned
  });
}

export async function setAdminBulletinPinned(id, pinned = false, { now = new Date().toISOString() } = {}) {
  if (usesPostgresBulletinStore()) return setPostgresAdminBulletinPinned(id, pinned, { now });
  if (usesLibSqlBulletinStore()) return setLibSqlAdminBulletinPinned(id, pinned, { now });
  const store = await readBulletinStore();
  const message = store.messages.find((item) => item.id === id);
  if (!message) throw Object.assign(new Error('Không tìm thấy tin nhắn.'), { status: 404 });
  if (message.authorRole !== 'admin') {
    throw Object.assign(new Error('Chỉ tin nhắn admin mới được ghim.'), { status: 400 });
  }
  message.pinned = Boolean(pinned);
  message.pinnedAt = message.pinned ? now : null;
  message.updatedAt = now;
  await writeBulletinStore(store);
  return publicMessage(message);
}

async function appendMessage({ text, now, authorRole, authorId, authorName, pinned = false }) {
  const cleanText = normalizeMessageText(text);
  const message = {
    id: createMessageId(),
    text: cleanText,
    authorRole,
    authorId,
    authorName: String(authorName || '').trim() || (authorRole === 'admin' ? 'Admin' : 'Reader'),
    pinned: authorRole === 'admin' ? Boolean(pinned) : false,
    pinnedAt: authorRole === 'admin' && pinned ? now : null,
    createdAt: now,
    updatedAt: now
  };
  if (usesPostgresBulletinStore()) {
    await insertPostgresMessage(message);
    return publicMessage(message);
  }
  if (usesLibSqlBulletinStore()) {
    await insertLibSqlMessage(message);
    return publicMessage(message);
  }
  const store = await readBulletinStore();
  store.messages = sortMessages([message, ...store.messages]).slice(0, MAX_MESSAGES);
  await writeBulletinStore(store);
  return publicMessage(message);
}

async function listPostgresBulletinMessages({ limit = 30 } = {}) {
  await ensurePostgresSchema();
  const result = await queryPostgres(
    `select * from bulletin_messages
     order by pinned desc,
              coalesce(pinned_at, created_at) desc,
              created_at desc
     limit $1`,
    [Math.max(1, Number(limit || 30))]
  );
  return result.rows.map(messageFromPostgresRow).map(publicMessage);
}

async function insertPostgresMessage(message) {
  await ensurePostgresSchema();
  await queryPostgres(
    `insert into bulletin_messages (
       id, text, author_role, author_id, author_name, pinned, pinned_at, created_at, updated_at
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      message.id,
      message.text,
      message.authorRole,
      message.authorId,
      message.authorName,
      message.pinned,
      message.pinnedAt,
      message.createdAt,
      message.updatedAt
    ]
  );
}

async function setPostgresAdminBulletinPinned(id, pinned = false, { now = new Date().toISOString() } = {}) {
  await ensurePostgresSchema();
  const existing = await queryPostgres('select * from bulletin_messages where id = $1 limit 1', [id]);
  const message = existing.rows[0] ? messageFromPostgresRow(existing.rows[0]) : null;
  if (!message) throw Object.assign(new Error('Không tìm thấy tin nhắn.'), { status: 404 });
  if (message.authorRole !== 'admin') {
    throw Object.assign(new Error('Chỉ tin nhắn admin mới được ghim.'), { status: 400 });
  }
  const nextPinnedAt = pinned ? now : null;
  await queryPostgres(
    'update bulletin_messages set pinned = $1, pinned_at = $2, updated_at = $3 where id = $4',
    [Boolean(pinned), nextPinnedAt, now, id]
  );
  return publicMessage({
    ...message,
    pinned: Boolean(pinned),
    pinnedAt: nextPinnedAt,
    updatedAt: now
  });
}

async function listLibSqlBulletinMessages({ limit = 30 } = {}) {
  await ensureLibSqlSchema();
  const client = await getLibSqlClient();
  const result = await client.execute({
    sql: `select * from bulletin_messages
          order by pinned desc,
                   coalesce(pinned_at, created_at) desc,
                   created_at desc
          limit ?`,
    args: [Math.max(1, Number(limit || 30))]
  });
  return result.rows.map(messageFromLibSqlRow).map(publicMessage);
}

async function insertLibSqlMessage(message) {
  await ensureLibSqlSchema();
  const client = await getLibSqlClient();
  await client.execute({
    sql: `insert into bulletin_messages (
            id, text, author_role, author_id, author_name, pinned, pinned_at, created_at, updated_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      message.id,
      message.text,
      message.authorRole,
      message.authorId,
      message.authorName,
      message.pinned ? 1 : 0,
      message.pinnedAt,
      message.createdAt,
      message.updatedAt
    ]
  });
}

async function setLibSqlAdminBulletinPinned(id, pinned = false, { now = new Date().toISOString() } = {}) {
  await ensureLibSqlSchema();
  const client = await getLibSqlClient();
  const existing = await client.execute({
    sql: 'select * from bulletin_messages where id = ? limit 1',
    args: [id]
  });
  const message = existing.rows[0] ? messageFromLibSqlRow(existing.rows[0]) : null;
  if (!message) throw Object.assign(new Error('Không tìm thấy tin nhắn.'), { status: 404 });
  if (message.authorRole !== 'admin') {
    throw Object.assign(new Error('Chỉ tin nhắn admin mới được ghim.'), { status: 400 });
  }
  const nextPinnedAt = pinned ? now : null;
  await client.execute({
    sql: 'update bulletin_messages set pinned = ?, pinned_at = ?, updated_at = ? where id = ?',
    args: [pinned ? 1 : 0, nextPinnedAt, now, id]
  });
  return publicMessage({
    ...message,
    pinned: Boolean(pinned),
    pinnedAt: nextPinnedAt,
    updatedAt: now
  });
}

async function ensureLibSqlSchema() {
  if (!libSqlSchemaPromise) {
    libSqlSchemaPromise = (async () => {
      const client = await getLibSqlClient();
      await client.batch([
        `create table if not exists bulletin_messages (
          id text primary key,
          text text not null,
          author_role text not null,
          author_id text not null,
          author_name text not null,
          pinned integer not null default 0,
          pinned_at text,
          created_at text not null,
          updated_at text not null
        )`,
        'create index if not exists idx_bulletin_messages_pinned on bulletin_messages(pinned, pinned_at)',
        'create index if not exists idx_bulletin_messages_created_at on bulletin_messages(created_at)'
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

function messageFromLibSqlRow(row = {}) {
  return normalizeMessage({
    id: row.id,
    text: row.text,
    authorRole: row.author_role ?? row.authorRole,
    authorId: row.author_id ?? row.authorId,
    authorName: row.author_name ?? row.authorName,
    pinned: Boolean(Number(row.pinned ?? 0)),
    pinnedAt: row.pinned_at ?? row.pinnedAt ?? null,
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt
  });
}

function messageFromPostgresRow(row = {}) {
  return normalizeMessage({
    id: row.id,
    text: row.text,
    authorRole: row.author_role ?? row.authorRole,
    authorId: row.author_id ?? row.authorId,
    authorName: row.author_name ?? row.authorName,
    pinned: Boolean(row.pinned),
    pinnedAt: row.pinned_at ? new Date(row.pinned_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined
  });
}

function libSqlDatabaseUrl() {
  return process.env.LIBSQL_DATABASE_URL || process.env.TURSO_DATABASE_URL || '';
}

function libSqlAuthToken() {
  return process.env.LIBSQL_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN || '';
}

async function readBulletinStore() {
  try {
    const value = JSON.parse(await fs.readFile(BULLETIN_STORE_PATH, 'utf8'));
    return {
      messages: Array.isArray(value.messages) ? value.messages.map(normalizeMessage).filter(Boolean) : []
    };
  } catch (error) {
    if (error.code === 'ENOENT') return { messages: [] };
    throw error;
  }
}

function writeBulletinStore(store) {
  const pending = writeQueue.then(() => writeBulletinStoreNow(store));
  writeQueue = pending.catch(() => {});
  return pending;
}

async function writeBulletinStoreNow(store) {
  await fs.mkdir(path.dirname(BULLETIN_STORE_PATH), { recursive: true });
  const tempPath = `${BULLETIN_STORE_PATH}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify({ messages: store.messages }, null, 2)}\n`, 'utf8');
  await fs.rename(tempPath, BULLETIN_STORE_PATH);
}

function normalizeMessage(value = {}) {
  if (!value.id || !value.text) return null;
  return {
    id: String(value.id),
    text: String(value.text),
    authorRole: value.authorRole === 'admin' ? 'admin' : 'user',
    authorId: String(value.authorId || ''),
    authorName: String(value.authorName || '').trim() || 'Reader',
    pinned: Boolean(value.pinned && value.authorRole === 'admin'),
    pinnedAt: value.pinnedAt || null,
    createdAt: value.createdAt || new Date(0).toISOString(),
    updatedAt: value.updatedAt || value.createdAt || new Date(0).toISOString()
  };
}

function normalizeMessageText(text = '') {
  const cleanText = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleanText) throw Object.assign(new Error('Vui lòng nhập nội dung tin nhắn.'), { status: 400 });
  if (cleanText.length > MAX_TEXT_LENGTH) {
    throw Object.assign(new Error(`Tin nhắn tối đa ${MAX_TEXT_LENGTH} ký tự.`), { status: 400 });
  }
  return cleanText;
}

function sortMessages(messages = []) {
  return [...messages].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const aTime = Date.parse(a.pinned ? a.pinnedAt || a.updatedAt : a.createdAt) || 0;
    const bTime = Date.parse(b.pinned ? b.pinnedAt || b.updatedAt : b.createdAt) || 0;
    return bTime - aTime;
  });
}

function publicMessage(message) {
  return {
    id: message.id,
    text: message.text,
    authorRole: message.authorRole,
    authorName: message.authorName,
    pinned: Boolean(message.pinned),
    createdAt: message.createdAt,
    updatedAt: message.updatedAt
  };
}

function createMessageId() {
  return `msg_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

function normalizeAdminId(adminEmail = '') {
  return `admin_${crypto.createHash('sha256').update(String(adminEmail || 'admin').toLowerCase()).digest('hex').slice(0, 12)}`;
}
