import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('postgres store supports verified TLS CA configuration', async () => {
  const source = await readFile(new URL('../server/postgresStore.mjs', import.meta.url), 'utf8');

  assert.match(source, /POSTGRES_SSL_CA_BASE64/);
  assert.match(source, /ssl\.ca\s*=\s*ca/);
  assert.match(source, /ssl\.servername\s*=\s*new URL\(databaseUrl\)\.hostname/);
  assert.match(source, /rejectUnauthorized:\s*process\.env\.POSTGRES_SSL_REJECT_UNAUTHORIZED !== 'false'/);
});
