import '../server/env.mjs';

import { spawn } from 'node:child_process';

import { catalogStorageSummary, productionPostgresCatalogUrl } from '../server/storageConfig.mjs';

const args = new Set(process.argv.slice(2));
const seriesId = valueArg('--series-id') || valueArg('--series') || '';
const requestedSteps = parseSteps(valueArg('--steps'));
const dryRun = args.has('--dry-run') || args.has('--plan');
const allowedSteps = new Set(['optimize', 'sync-images', 'sync-catalog-db']);
const invalidSteps = requestedSteps.filter((step) => !allowedSteps.has(step));
if (invalidSteps.length) {
  fail(`Invalid --steps value: ${invalidSteps.join(', ')}. Allowed steps: ${[...allowedSteps].join(', ')}.`);
}
const steps = requestedSteps.length ? requestedSteps : [
  'optimize',
  'sync-images',
  'sync-catalog-db'
];

if (!seriesId) fail('Missing --series-id <series-id>.');
if (!steps.length) fail('No valid steps requested.');
if (steps.includes('sync-catalog-db') && !productionPostgresCatalogUrl()) {
  fail('Missing PRODUCTION_CATALOG_DATABASE_URL or PRODUCTION_DATABASE_URL before Sync catalog DB.');
}
if (steps.some((step) => step === 'sync-images')) {
  preflightS3Config();
}

console.log(JSON.stringify({
  seriesId,
  steps,
  dryRun,
  storage: catalogStorageSummary()
}, null, 2));

if (dryRun) {
  console.log('[publish-series] dry-run only; commands are printed for review and will not be executed.');
  console.log('[publish-series] apply flags are shown because they are used by the real run.');
  for (const step of steps) {
    console.log(`[publish-series] plan ${step}: ${commandForStep(step).join(' ')}`);
  }
  console.log(`[publish-series] dry-run completed ${seriesId}`);
  process.exit(0);
}

for (const step of steps) {
  console.log(`[publish-series] start ${step}`);
  await runCommand(commandForStep(step), { s3Step: step === 'sync-images' });
  console.log(`[publish-series] done ${step}`);
}

console.log(`[publish-series] completed ${seriesId}`);

function commandForStep(step) {
  if (step === 'optimize') {
    return [
      process.execPath,
      'scripts/optimize-import-images.mjs',
      '--catalog-only',
      '--series-id',
      seriesId,
      '--limit',
      process.env.PRODUCTION_PUBLISH_OPTIMIZE_LIMIT || '800',
      '--apply',
      '--json'
    ];
  }
  if (step === 'sync-images') {
    return [
      process.execPath,
      'scripts/sync-vietnix-s3.mjs',
      '--images-only',
      '--catalog-only',
      '--series-id',
      seriesId,
      '--apply'
    ];
  }
  if (step === 'sync-catalog-db') {
    return [
      process.execPath,
      'scripts/sync-catalog-to-production-db.mjs',
      '--series-id',
      seriesId,
      '--apply'
    ];
  }
  throw new Error(`Unsupported step: ${step}`);
}

function runCommand(command, { s3Step = false } = {}) {
  return new Promise((resolve, reject) => {
    const [bin, ...args] = command;
    const env = {
      ...process.env
    };
    if (s3Step) {
      env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0';
      env.S3_SYNC_CONCURRENCY = process.env.S3_SYNC_CONCURRENCY || process.env.VIETNIX_S3_SYNC_CONCURRENCY || '6';
      env.S3_SYNC_RETRY_CONCURRENCY = process.env.S3_SYNC_RETRY_CONCURRENCY || process.env.VIETNIX_S3_SYNC_RETRY_CONCURRENCY || '2';
      env.S3_SYNC_RETRY_ROUNDS = process.env.S3_SYNC_RETRY_ROUNDS || process.env.VIETNIX_S3_SYNC_RETRY_ROUNDS || '3';
    }
    const child = spawn(bin, args, {
      cwd: process.cwd(),
      env,
      shell: false,
      stdio: 'inherit',
      windowsHide: true
    });
    child.on('error', reject);
    child.on('close', (exitCode, signal) => {
      if (exitCode === 0) {
        resolve();
        return;
      }
      reject(new Error(`Command failed (${exitCode ?? signal}): ${command.join(' ')}`));
    });
  });
}

function valueArg(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return '';
  return String(process.argv[index + 1] || '').trim();
}

function parseSteps(value = '') {
  return String(value || '')
    .split(',')
    .map((step) => step.trim())
    .filter(Boolean);
}

function preflightS3Config() {
  const missing = [];
  if (!envAny('S3_ENDPOINT', 'VIETNIX_S3_ENDPOINT')) missing.push('S3_ENDPOINT');
  if (!envAny('S3_BUCKET', 'VIETNIX_S3_BUCKET')) missing.push('S3_BUCKET');
  if (!envAny('S3_ACCESS_KEY_ID', 'AWS_ACCESS_KEY_ID', 'VIETNIX_S3_ACCESS_KEY_ID')) missing.push('S3_ACCESS_KEY_ID');
  if (!envAny('S3_SECRET_ACCESS_KEY', 'AWS_SECRET_ACCESS_KEY', 'VIETNIX_S3_SECRET_ACCESS_KEY')) missing.push('S3_SECRET_ACCESS_KEY');
  if (missing.length) {
    fail(`Missing S3 config before sync step: ${missing.join(', ')}.`);
  }
}

function envAny(...names) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

