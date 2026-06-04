import './env.mjs';
import { extractUserToken, getSessionUser, loginUser, logoutUser, registerUser } from './userStore.mjs';

export function withUserApi(handler) {
  return async function userApiHandler(req, res) {
    setJsonHeaders(res);
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    try {
      await handler(req, res);
    } catch (error) {
      sendJson(res, error.status || 500, { error: error.message || 'User API failed' });
    }
  };
}

export async function handleRegister(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res);
  sendJson(res, 201, await registerUser(await readJsonBody(req)));
}

export async function handleLogin(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res);
  sendJson(res, 200, await loginUser(await readJsonBody(req)));
}

export async function handleMe(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res);
  const user = await getSessionUser(extractUserToken(req.headers));
  sendJson(res, user ? 200 : 401, user || { error: 'User session is required.' });
}

export async function handleLogout(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res);
  sendJson(res, 202, await logoutUser(extractUserToken(req.headers)));
}

function methodNotAllowed(res) {
  sendJson(res, 405, { error: 'Method not allowed' });
}

function setJsonHeaders(res) {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('access-control-allow-origin', process.env.PUBLIC_SITE_URL || '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type, authorization, x-user-token');
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
