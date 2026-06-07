import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { findEncodingIssues, mojibakePatterns } from '../scripts/check-encoding.mjs';

test('encoding guard catches common Vietnamese mojibake markers', () => {
  const bad = 'Phi\u00c3\u00aan admin \u00c4\u2018\u00c3\u00a3 h\u00e1\u00ba\u00bft h\u00e1\u00ba\u00a1n';
  assert.equal(mojibakePatterns.some((pattern) => pattern.test(bad)), true);
  mojibakePatterns.forEach((pattern) => { pattern.lastIndex = 0; });
  assert.equal(mojibakePatterns.some((pattern) => pattern.test('Cuon Truyen - Doc truyen')), false);
});

test('encoding guard scans Next.js source files for Vietnamese mojibake', async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'comic-encoding-'));
  await fs.mkdir(path.join(cwd, 'src', 'app'), { recursive: true });
  await fs.writeFile(
    path.join(cwd, 'src', 'app', 'page.tsx'),
    "export default function Page() { return <h1>Cuá»™n Truyá»‡n</h1>; }\n",
    'utf8'
  );

  const issues = await findEncodingIssues({ cwd });

  assert.deepEqual(issues.map((issue) => issue.file), [path.join('src', 'app', 'page.tsx')]);
});
