import assert from 'node:assert/strict';
import test from 'node:test';

import { nodeApiHandlerAsNext } from '../src/lib/server/node-api-adapter.mjs';

test('nodeApiHandlerAsNext exposes Next requests as node-style API req/res', async () => {
  const response = await nodeApiHandlerAsNext(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks).toString('utf8');

    res.statusCode = 201;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('x-adapter-test', 'ok');
    res.end(JSON.stringify({
      method: req.method,
      url: req.url,
      token: req.headers['x-user-token'],
      limit: req.query.limit,
      messageId: req.query.messageId,
      body: JSON.parse(body)
    }));
  }, new Request('https://example.test/api/demo?limit=5', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-user-token': 'reader-token'
    },
    body: JSON.stringify({ text: 'Xin chào' })
  }), {
    params: { messageId: 'msg_1' }
  });

  assert.equal(response.status, 201);
  assert.equal(response.headers.get('x-adapter-test'), 'ok');
  assert.deepEqual(await response.json(), {
    method: 'POST',
    url: '/api/demo?limit=5',
    token: 'reader-token',
    limit: '5',
    messageId: 'msg_1',
    body: { text: 'Xin chào' }
  });
});

test('nodeApiHandlerAsNext preserves redirects and cookies from node handlers', async () => {
  const response = await nodeApiHandlerAsNext(async (_req, res) => {
    res.statusCode = 302;
    res.setHeader('set-cookie', 'google_oauth_state=abc; Path=/; HttpOnly');
    res.setHeader('location', 'https://accounts.google.com/o/oauth2/v2/auth');
    res.end();
  }, new Request('https://example.test/api/auth/google/start'));

  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.match(response.headers.get('set-cookie') || '', /google_oauth_state=abc/);
});
