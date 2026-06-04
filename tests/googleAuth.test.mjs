import assert from 'node:assert/strict';
import test from 'node:test';

const {
  buildGoogleAuthUrl,
  parseGoogleIdTokenPayload,
  verifyGoogleIdTokenPayload
} = await import(`../server/googleAuth.mjs?test=${Date.now()}`);

test('buildGoogleAuthUrl includes the configured redirect URI, scopes and state', () => {
  const url = new URL(buildGoogleAuthUrl({
    clientId: 'client-id',
    redirectUri: 'https://example.com/api/auth/google/callback',
    state: 'state-token'
  }));

  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('client_id'), 'client-id');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://example.com/api/auth/google/callback');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('state'), 'state-token');
  assert.match(url.searchParams.get('scope'), /openid/);
  assert.match(url.searchParams.get('scope'), /email/);
});

test('verifyGoogleIdTokenPayload accepts a verified email for the configured audience', () => {
  const payload = verifyGoogleIdTokenPayload({
    aud: 'client-id',
    sub: 'subject-1',
    email: 'reader@example.com',
    email_verified: true,
    name: 'Reader',
    exp: Math.floor(Date.now() / 1000) + 60
  }, {
    clientId: 'client-id'
  });

  assert.equal(payload.email, 'reader@example.com');
  assert.equal(payload.emailVerified, true);
});

test('parseGoogleIdTokenPayload decodes the JWT payload without trusting it', () => {
  const payload = Buffer.from(JSON.stringify({ aud: 'client-id', email: 'reader@example.com' })).toString('base64url');
  const token = `header.${payload}.signature`;

  assert.deepEqual(parseGoogleIdTokenPayload(token), {
    aud: 'client-id',
    email: 'reader@example.com'
  });
});
