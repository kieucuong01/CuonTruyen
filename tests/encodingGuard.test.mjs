import test from 'node:test';
import assert from 'node:assert/strict';

import { mojibakePatterns } from '../scripts/check-encoding.mjs';

test('encoding guard catches common Vietnamese mojibake markers', () => {
  const bad = 'Cuá»™n Truyá»‡n - Äá»c truyá»‡n';
  assert.equal(mojibakePatterns.some((pattern) => pattern.test(bad)), true);
  mojibakePatterns.forEach((pattern) => { pattern.lastIndex = 0; });
  assert.equal(mojibakePatterns.some((pattern) => pattern.test('Cuon Truyen - Doc truyen')), false);
});
