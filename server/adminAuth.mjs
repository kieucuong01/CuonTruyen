const REQUIRED_ADMIN_ENV_VARS = ['ADMIN_EMAIL', 'ADMIN_PASSWORD', 'ADMIN_TOKEN'];

export function adminConfigStatus(config = {}) {
  const values = {
    ADMIN_EMAIL: config.email ?? process.env.ADMIN_EMAIL,
    ADMIN_PASSWORD: config.password ?? process.env.ADMIN_PASSWORD,
    ADMIN_TOKEN: config.token ?? process.env.ADMIN_TOKEN
  };
  const missing = REQUIRED_ADMIN_ENV_VARS.filter((name) => !String(values[name] || '').trim());
  return {
    configured: missing.length === 0,
    missing,
    email: String(values.ADMIN_EMAIL || '').trim().toLowerCase(),
    token: String(values.ADMIN_TOKEN || '').trim()
  };
}

export function requiredAdminToken() {
  return adminConfigStatus().token;
}

export function extractAdminToken(headers = {}) {
  const direct = headers['x-admin-token'] || headers['X-Admin-Token'];
  if (direct) return String(direct);
  const authorization = headers.authorization || headers.Authorization || '';
  const match = String(authorization).match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : '';
}

export function isAdminAuthorized(headers = {}, requiredToken = requiredAdminToken()) {
  if (!requiredToken) return false;
  return extractAdminToken(headers) === requiredToken;
}

export function createAdminSession(credentials = {}, config = {}) {
  const status = adminConfigStatus(config);
  if (!status.configured) return null;
  const expectedEmail = status.email;
  const expectedPassword = String(config.password ?? process.env.ADMIN_PASSWORD);
  const email = String(credentials.email || '').trim().toLowerCase();
  const password = String(credentials.password || '');
  if (email !== expectedEmail || password !== expectedPassword) return null;
  return {
    email: expectedEmail,
    token: status.token
  };
}

export function isAdminPath(pathname = '') {
  return pathname.startsWith('/api/admin/') || pathname === '/api/import';
}
