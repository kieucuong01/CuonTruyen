import crypto from 'node:crypto';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
const STATE_TTL_MS = 10 * 60 * 1000;

export function googleOAuthConfigured(env = process.env) {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export function googleOAuthConfig(env = process.env, req = null) {
  const baseUrl = (env.PUBLIC_SITE_URL || requestBaseUrl(req) || '').replace(/\/$/, '');
  return {
    clientId: String(env.GOOGLE_CLIENT_ID || ''),
    clientSecret: String(env.GOOGLE_CLIENT_SECRET || ''),
    redirectUri: String(env.GOOGLE_REDIRECT_URI || (baseUrl ? `${baseUrl}/api/auth/google/callback` : '')),
    stateSecret: String(env.GOOGLE_OAUTH_STATE_SECRET || env.ADMIN_TOKEN || env.GOOGLE_CLIENT_SECRET || '')
  };
}

export function buildGoogleAuthUrl({ clientId, redirectUri, state } = {}) {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'select_account');
  return url.toString();
}

export function createGoogleOAuthState({ secret, now = Date.now(), nonce = crypto.randomBytes(16).toString('hex') } = {}) {
  if (!secret) throw Object.assign(new Error('Google OAuth state secret is not configured.'), { status: 503 });
  const payload = `${now}.${nonce}`;
  const signature = signState(payload, secret);
  return `${payload}.${signature}`;
}

export function verifyGoogleOAuthState(state = '', cookieState = '', { secret, now = Date.now() } = {}) {
  if (!state || !cookieState || state !== cookieState) {
    throw Object.assign(new Error('Phiên đăng nhập Google không hợp lệ.'), { status: 400 });
  }
  const parts = String(state).split('.');
  if (parts.length !== 3) throw Object.assign(new Error('Phiên đăng nhập Google không hợp lệ.'), { status: 400 });
  const [issuedAt, nonce, signature] = parts;
  const payload = `${issuedAt}.${nonce}`;
  if (signState(payload, secret) !== signature) {
    throw Object.assign(new Error('Phiên đăng nhập Google không hợp lệ.'), { status: 400 });
  }
  if (now - Number(issuedAt) > STATE_TTL_MS) {
    throw Object.assign(new Error('Phiên đăng nhập Google đã hết hạn.'), { status: 400 });
  }
  return true;
}

export async function exchangeGoogleCodeForProfile({ code, clientId, clientSecret, redirectUri, fetchImpl = fetch } = {}) {
  if (!code) throw Object.assign(new Error('Google không trả mã đăng nhập.'), { status: 400 });
  const tokenResponse = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  });
  const tokenPayload = await tokenResponse.json();
  if (!tokenResponse.ok) {
    throw Object.assign(new Error(tokenPayload.error_description || tokenPayload.error || 'Không đổi được mã Google.'), { status: 502 });
  }
  const info = tokenPayload.id_token
    ? await verifyGoogleIdTokenWithTokenInfo(tokenPayload.id_token, { clientId, fetchImpl })
    : verifyGoogleIdTokenPayload(tokenPayload, { clientId });
  return info;
}

export async function verifyGoogleIdTokenWithTokenInfo(idToken, { clientId, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(`${GOOGLE_TOKENINFO_URL}?id_token=${encodeURIComponent(idToken)}`);
  const payload = await response.json();
  if (!response.ok) {
    throw Object.assign(new Error(payload.error_description || payload.error || 'Không xác minh được Google ID token.'), { status: 401 });
  }
  return verifyGoogleIdTokenPayload(payload, { clientId });
}

export function parseGoogleIdTokenPayload(idToken = '') {
  const [, payload] = String(idToken).split('.');
  if (!payload) throw Object.assign(new Error('Google ID token không hợp lệ.'), { status: 401 });
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

export function verifyGoogleIdTokenPayload(payload = {}, { clientId, now = Date.now() } = {}) {
  if (String(payload.aud || '') !== String(clientId || '')) {
    throw Object.assign(new Error('Google token không đúng ứng dụng.'), { status: 401 });
  }
  if (payload.exp && Number(payload.exp) * 1000 < now) {
    throw Object.assign(new Error('Google token đã hết hạn.'), { status: 401 });
  }
  const email = String(payload.email || '').trim().toLowerCase();
  const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
  if (!email || !emailVerified || !payload.sub) {
    throw Object.assign(new Error('Google chưa xác minh email tài khoản.'), { status: 401 });
  }
  return {
    email,
    emailVerified,
    name: String(payload.name || payload.given_name || '').trim(),
    picture: String(payload.picture || ''),
    sub: String(payload.sub)
  };
}

export function googleStateCookie(state, req = null) {
  const secure = isSecureRequest(req) ? '; Secure' : '';
  return `google_oauth_state=${encodeURIComponent(state)}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=600${secure}`;
}

export function clearGoogleStateCookie(req = null) {
  const secure = isSecureRequest(req) ? '; Secure' : '';
  return `google_oauth_state=; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function readCookie(headers = {}, name = '') {
  const cookie = String(headers.cookie || headers.Cookie || '');
  const match = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
}

function signState(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function requestBaseUrl(req) {
  if (!req?.headers) return '';
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return host ? `${proto}://${host}` : '';
}

function isSecureRequest(req) {
  return !req || req.headers?.['x-forwarded-proto'] === 'https' || process.env.VERCEL;
}
