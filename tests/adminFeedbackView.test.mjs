import assert from 'node:assert/strict';
import test from 'node:test';

import {
  renderAdminApiError,
  renderAdminLoginView,
  renderProductionCheckResult
} from '../public/routes/adminFeedbackView.mjs';

test('admin login view escapes email and message while preserving topbar shell', () => {
  const html = renderAdminLoginView({
    topbarHtml: '<nav>topbar</nav>',
    email: 'admin"<x>@example.test',
    message: 'Phiên <hết hạn>'
  });

  assert.match(html, /<nav>topbar<\/nav>/);
  assert.match(html, /data-admin-login-form/);
  assert.match(html, /value="admin&quot;&lt;x&gt;@example\.test"/);
  assert.match(html, /status-line error/);
  assert.match(html, /Phiên &lt;hết hạn&gt;/);
  assert.doesNotMatch(html, /<hết hạn>/);
});

test('production check result renders escaped successful and failed checks', () => {
  const html = renderProductionCheckResult({
    ok: true,
    status: 204,
    checks: [
      { ok: true, label: 'Page <ok>', url: 'https://prod.test/page', status: 200 },
      { ok: false, key: 'cover', url: 'https://prod.test/cover', error: 'timeout <x>' }
    ]
  }, 'https://prod.test/truyen?a=<b>');

  assert.match(html, /Production OK \(204\)/);
  assert.match(html, /https:\/\/prod\.test\/truyen\?a=&lt;b&gt;/);
  assert.match(html, /Page &lt;ok&gt;/);
  assert.match(html, /HTTP 200/);
  assert.match(html, /timeout &lt;x&gt;/);
  assert.doesNotMatch(html, /timeout <x>/);
});

test('admin API error includes payload details without leaking HTML', () => {
  const error = new Error('Outer <message>');
  error.payload = {
    error: 'Pipeline <failed>',
    cause: 'DB <down>',
    storage: {
      mode: 'postgres',
      postgres: { host: 'db.internal', database: 'comic_reader' }
    },
    hints: ['Set <env>', 'Retry']
  };

  const html = renderAdminApiError(error, 'Fallback');

  assert.match(html, /Pipeline &lt;failed&gt;/);
  assert.match(html, /Outer &lt;message&gt;/);
  assert.match(html, /DB &lt;down&gt;/);
  assert.match(html, /Catalog storage: Postgres - db\.internal\/comic_reader/);
  assert.match(html, /Set &lt;env&gt; \| Retry/);
  assert.doesNotMatch(html, /<failed>/);
});
