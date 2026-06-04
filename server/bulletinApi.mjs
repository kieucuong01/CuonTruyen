import './env.mjs';
import { adminConfigStatus, isAdminAuthorized } from './adminAuth.mjs';
import {
  createAdminBulletinMessage,
  createUserBulletinMessage,
  listBulletinMessages,
  setAdminBulletinPinned
} from './bulletinStore.mjs';
import { extractUserToken, getSessionUser } from './userStore.mjs';

export function withBulletinApi(handler) {
  return async function bulletinApiHandler(req, res) {
    setJsonHeaders(res);
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    try {
      await handler(req, res);
    } catch (error) {
      sendJson(res, error.status || 500, { error: error.message || 'Bulletin API failed' });
    }
  };
}

export function withAdminBulletinApi(handler) {
  return withBulletinApi(async (req, res) => {
    const config = adminConfigStatus();
    if (!config.configured) {
      sendJson(res, 503, { error: `Admin environment is not configured. Missing: ${config.missing.join(', ')}.` });
      return;
    }
    if (!isAdminAuthorized(req.headers)) {
      sendJson(res, 401, { error: 'Admin token is required.' });
      return;
    }
    await handler(req, res);
  });
}

export async function handleBulletinMessages(req, res) {
  if (req.method === 'GET') {
    sendJson(res, 200, { messages: await listBulletinMessages({ limit: limitFromQuery(req, 30) }) });
    return;
  }
  if (req.method === 'POST') {
    const user = await getSessionUser(extractUserToken(req.headers));
    if (!user) {
      sendJson(res, 401, { error: 'Bạn cần đăng nhập để gửi tin nhắn.' });
      return;
    }
    const message = await createUserBulletinMessage({
      ...(await readJsonBody(req)),
      user
    });
    sendJson(res, 201, { message });
    return;
  }
  methodNotAllowed(res);
}

export async function handleAdminBulletinMessages(req, res) {
  if (req.method === 'GET') {
    sendJson(res, 200, { messages: await listBulletinMessages({ limit: limitFromQuery(req, 60) }) });
    return;
  }
  if (req.method === 'POST') {
    const message = await createAdminBulletinMessage({
      ...(await readJsonBody(req)),
      adminEmail: adminConfigStatus().email
    });
    sendJson(res, 201, { message });
    return;
  }
  methodNotAllowed(res);
}

export async function handleAdminBulletinMessage(req, res) {
  if (req.method !== 'PATCH') {
    methodNotAllowed(res);
    return;
  }
  const id = req.query?.id || req.query?.messageId || '';
  const body = await readJsonBody(req);
  const message = await setAdminBulletinPinned(String(id), Boolean(body.pinned));
  sendJson(res, 200, { message });
}

function methodNotAllowed(res) {
  sendJson(res, 405, { error: 'Method not allowed' });
}

function setJsonHeaders(res) {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('access-control-allow-origin', process.env.PUBLIC_SITE_URL || '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type, authorization, x-admin-token, x-user-token');
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return req.body ? JSON.parse(req.body) : {};

  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? JSON.parse(raw) : {};
}

function limitFromQuery(req, fallback) {
  const raw = req.query?.limit || new URL(req.url || '/', 'https://local.test').searchParams.get('limit') || fallback;
  return Number(raw || fallback);
}
