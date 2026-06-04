import './env.mjs';
import { authenticateGoogleUser } from './userStore.mjs';
import {
  buildGoogleAuthUrl,
  clearGoogleStateCookie,
  createGoogleOAuthState,
  exchangeGoogleCodeForProfile,
  googleOAuthConfig,
  googleOAuthConfigured,
  googleStateCookie,
  readCookie,
  verifyGoogleOAuthState
} from './googleAuth.mjs';

export function withGoogleAuthApi(handler) {
  return async function googleAuthHandler(req, res) {
    try {
      await handler(req, res);
    } catch (error) {
      sendHtml(res, error.status || 500, renderAuthError(error.message || 'Không thể đăng nhập Google.'));
    }
  };
}

export async function handleGoogleStart(req, res) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }
  if (!googleOAuthConfigured()) {
    sendJson(res, 503, { error: 'Google login chưa được cấu hình. Cần GOOGLE_CLIENT_ID và GOOGLE_CLIENT_SECRET.' });
    return;
  }
  const config = googleOAuthConfig(process.env, req);
  const state = createGoogleOAuthState({ secret: config.stateSecret });
  res.statusCode = 302;
  res.setHeader('set-cookie', googleStateCookie(state, req));
  res.setHeader('location', buildGoogleAuthUrl({
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    state
  }));
  res.end();
}

export async function handleGoogleCallback(req, res) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }
  const url = new URL(req.url || '/', 'https://local.test');
  if (url.searchParams.get('error')) {
    throw Object.assign(new Error('Google đã hủy hoặc từ chối đăng nhập.'), { status: 400 });
  }
  const config = googleOAuthConfig(process.env, req);
  verifyGoogleOAuthState(
    url.searchParams.get('state') || '',
    readCookie(req.headers, 'google_oauth_state'),
    { secret: config.stateSecret }
  );
  const profile = await exchangeGoogleCodeForProfile({
    code: url.searchParams.get('code'),
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri
  });
  const session = await authenticateGoogleUser(profile);
  res.setHeader('set-cookie', clearGoogleStateCookie(req));
  sendHtml(res, 200, renderAuthSuccess(session));
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function sendHtml(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(body);
}

function renderAuthSuccess(session) {
  const sessionJson = JSON.stringify(session).replace(/</g, '\\u003c');
  return `<!doctype html>
<meta charset="utf-8">
<title>Đăng nhập Google</title>
<script>
localStorage.setItem('comic-user-session', ${JSON.stringify(sessionJson)});
location.replace('/');
</script>
<p>Đăng nhập Google thành công. Đang quay lại Cuốn Truyện...</p>`;
}

function renderAuthError(message) {
  const safeMessage = String(message || '').replace(/[<>&"]/g, (char) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;'
  })[char]);
  return `<!doctype html>
<meta charset="utf-8">
<title>Không thể đăng nhập Google</title>
<p>${safeMessage}</p>
<p><a href="/#/login">Quay lại đăng nhập</a></p>`;
}
