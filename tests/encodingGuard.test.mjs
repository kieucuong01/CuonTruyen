import test from 'node:test';
import assert from 'node:assert/strict';

import { findEncodingIssues, mojibakePatterns } from '../scripts/check-encoding.mjs';

test('encoding guard catches common Vietnamese mojibake markers', () => {
  const bad = 'Phi\u00c3\u00aan admin \u00c4\u2018\u00c3\u00a3 h\u00e1\u00ba\u00bft h\u00e1\u00ba\u00a1n';
  assert.equal(mojibakePatterns.some((pattern) => pattern.test(bad)), true);
  mojibakePatterns.forEach((pattern) => { pattern.lastIndex = 0; });
  assert.equal(mojibakePatterns.some((pattern) => pattern.test('Cuon Truyen - Doc truyen')), false);
});

test('admin route copy stays valid UTF-8 Vietnamese', async () => {
  const issues = await findEncodingIssues({ targets: ['public/routes/admin.mjs'] });
  assert.deepEqual(issues, []);
});
