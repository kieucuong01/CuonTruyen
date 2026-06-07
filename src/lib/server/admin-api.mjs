import {
  adminConfigStatus,
  createAdminSession,
  isAdminAuthorized
} from '../../../server/adminAuth.mjs';
import { headersObjectFromNextRequest } from './node-api-adapter.mjs';

export async function nextAdminSessionApi(request) {
  const config = adminConfigStatus();
  if (!config.configured) {
    return {
      status: 503,
      body: { error: `Admin environment is not configured. Missing: ${config.missing.join(', ')}.` }
    };
  }

  if (request.method === 'POST') {
    const session = createAdminSession(await readJsonBody(request));
    return {
      status: session ? 200 : 401,
      body: session || { error: 'Email hoặc mật khẩu admin không đúng.' }
    };
  }

  if (request.method === 'GET') {
    if (!isAdminAuthorized(headersObjectFromNextRequest(request))) {
      return { status: 401, body: { error: 'Admin token is required.' } };
    }
    return {
      status: 200,
      body: {
        email: config.email,
        authenticated: true
      }
    };
  }

  return { status: 405, body: { error: 'Method not allowed' } };
}

async function readJsonBody(request) {
  const raw = await request.text();
  return raw.trim() ? JSON.parse(raw) : {};
}
