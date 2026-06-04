import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const BULLETIN_STORE_PATH = path.resolve(process.env.BULLETIN_STORE_PATH || path.join(ROOT, 'data', 'bulletin-messages.json'));
const MAX_MESSAGES = Number(process.env.BULLETIN_MAX_MESSAGES || 200);
const MAX_TEXT_LENGTH = Number(process.env.BULLETIN_MAX_TEXT_LENGTH || 500);
let writeQueue = Promise.resolve();

export async function listBulletinMessages({ limit = 30 } = {}) {
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
  const store = await readBulletinStore();
  store.messages = sortMessages([message, ...store.messages]).slice(0, MAX_MESSAGES);
  await writeBulletinStore(store);
  return publicMessage(message);
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
