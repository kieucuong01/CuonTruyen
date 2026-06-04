import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MAX_LOG_LINES = 80;
const MAX_LOG_TEXT = 24_000;
const jobs = new Map();

export function createProductionPublishJob({ seriesId, seriesSlug = '', title = '' } = {}) {
  const normalizedSeriesId = String(seriesId || '').trim();
  if (!normalizedSeriesId) throw new Error('Series id is required.');

  const runningJob = [...jobs.values()].find((job) => (
    job.seriesId === normalizedSeriesId
    && ['queued', 'running'].includes(job.status)
  ));
  if (runningJob) return { job: publicJob(runningJob), reused: true };

  const job = {
    id: `production-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    seriesId: normalizedSeriesId,
    seriesSlug: String(seriesSlug || ''),
    title: String(title || ''),
    status: 'queued',
    stepIndex: -1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    finishedAt: '',
    error: '',
    logs: [],
    steps: buildSteps(normalizedSeriesId),
    result: {}
  };
  jobs.set(job.id, job);
  runProductionPublishJob(job);
  return { job: publicJob(job), reused: false };
}

export function getProductionPublishJob(id) {
  const job = jobs.get(String(id || ''));
  return job ? publicJob(job) : null;
}

function buildSteps(seriesId) {
  return [
    {
      key: 'optimize',
      label: 'Tối ưu ảnh của truyện này',
      description: 'Nén JPG/PNG sang bản WebP khi tiết kiệm đủ dung lượng.',
      command: [process.execPath, 'scripts/optimize-import-images.mjs', '--catalog-only', '--series-id', seriesId, '--all', '--apply', '--cleanup-originals', '--json']
    },
    {
      key: 'relink',
      label: 'Relink ảnh đã tối ưu',
      description: 'Cập nhật catalog trỏ sang file WebP đã có và dọn file gốc an toàn.',
      command: [process.execPath, 'scripts/relink-existing-optimized-images.mjs', '--series-id', seriesId, '--apply', '--cleanup-originals']
    },
    {
      key: 'cleanup',
      label: 'Dọn ảnh thừa của truyện',
      description: 'Xóa ảnh local không còn được catalog tham chiếu trong thư mục truyện.',
      command: [process.execPath, 'scripts/cleanup-unreferenced-import-images.mjs', '--series-id', seriesId, '--apply']
    },
    {
      key: 'export-static-api',
      label: 'Export static API',
      description: 'Sinh lại JSON public để Vercel đọc dữ liệu mới.',
      command: [process.execPath, 'scripts/export-static-api.mjs']
    },
    {
      key: 'sync-images',
      label: 'Sync ảnh truyện lên S3',
      description: 'Đẩy riêng thư mục ảnh của truyện lên Vietnix S3.',
      command: [process.execPath, 'scripts/sync-vietnix-s3.mjs', '--images-only', '--series-id', seriesId, '--apply'],
      s3Step: true
    },
    {
      key: 'sync-static-api',
      label: 'Sync static API lên S3',
      description: 'Đẩy JSON public mới lên Vietnix S3 để production cập nhật.',
      command: [process.execPath, 'scripts/sync-vietnix-s3.mjs', '--static-api-only', '--apply'],
      s3Step: true
    }
  ].map((step) => ({
    ...step,
    status: 'pending',
    startedAt: '',
    finishedAt: '',
    exitCode: null,
    output: '',
    error: ''
  }));
}

async function runProductionPublishJob(job) {
  job.status = 'running';
  touch(job);
  try {
    for (let index = 0; index < job.steps.length; index += 1) {
      job.stepIndex = index;
      const step = job.steps[index];
      step.status = 'running';
      step.startedAt = new Date().toISOString();
      touch(job);
      appendLog(job, `Bắt đầu: ${step.label}`);
      const result = await runCommand(step.command, {
        s3Step: step.s3Step,
        onOutput: (text) => handleStepOutput(job, step, text)
      });
      step.exitCode = result.exitCode;
      step.output = result.output;
      if (result.exitCode !== 0) {
        step.status = 'failed';
        step.error = result.output || `Command exited with code ${result.exitCode}`;
        step.finishedAt = new Date().toISOString();
        throw new Error(step.error);
      }
      step.status = 'completed';
      step.finishedAt = new Date().toISOString();
      appendLog(job, `Hoàn tất: ${step.label}`);
      touch(job);
    }
    job.status = 'completed';
    job.finishedAt = new Date().toISOString();
    job.result = {
      message: 'Đã tối ưu, export và sync production xong.',
      completedAt: job.finishedAt
    };
    appendLog(job, job.result.message);
  } catch (error) {
    job.status = 'failed';
    job.error = cleanLog(error?.message || 'Production workflow failed.');
    job.finishedAt = new Date().toISOString();
    appendLog(job, `Lỗi: ${job.error}`);
  } finally {
    touch(job);
  }
}

function runCommand(command, { s3Step = false, onOutput = null } = {}) {
  return new Promise((resolve) => {
    const [bin, ...args] = command;
    const env = {
      ...process.env,
      ...(s3Step ? {
        NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0',
        S3_SYNC_CONCURRENCY: process.env.S3_SYNC_CONCURRENCY || process.env.VIETNIX_S3_SYNC_CONCURRENCY || '8'
      } : {})
    };
    const child = spawn(bin, args, {
      cwd: ROOT,
      env,
      shell: false,
      windowsHide: true
    });
    let output = '';
    const collect = (chunk) => {
      const text = chunk.toString('utf8');
      output = trimLog(`${output}${text}`);
      if (onOutput) onOutput(text);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', (error) => {
      resolve({ exitCode: 1, output: cleanLog(error?.message || 'Cannot start command.') });
    });
    child.on('close', (exitCode, signal) => {
      resolve({ exitCode: exitCode ?? (signal ? 1 : 0), output: cleanLog(output.trim()) });
    });
  });
}

function handleStepOutput(job, step, text) {
  const lines = String(text || '').split(/\r?\n/).map((line) => cleanLog(line.trim())).filter(Boolean);
  if (!lines.length) return;
  step.output = trimLog(`${step.output || ''}\n${lines.join('\n')}`.trim());
  for (const line of lines) {
    const progress = parseS3ProgressLine(line);
    if (progress) step.progress = progress;
    if (/^\[s3-sync\]/.test(line)) appendLog(job, line);
  }
  touch(job);
}

function parseS3ProgressLine(line) {
  const progress = String(line || '').match(/^\[s3-sync\]\s+(progress|done)\s+checked=(\d+)\/(\d+)\s+uploaded=(\d+)\s+skipped=(\d+)\s+rate=([\d.]+)\s+files\/min\s+eta=([^\s]+)\s+concurrency=(\d+)/);
  if (progress) {
    return {
      phase: progress[1],
      checked: Number(progress[2]),
      total: Number(progress[3]),
      uploaded: Number(progress[4]),
      skipped: Number(progress[5]),
      ratePerMinute: Number(progress[6]),
      eta: progress[7],
      concurrency: Number(progress[8])
    };
  }
  const start = String(line || '').match(/^\[s3-sync\]\s+(\S+)\s+(\d+)\s+files\b.*\bconcurrency=(\d+)/);
  if (!start) return null;
  return {
    phase: start[1],
    checked: 0,
    total: Number(start[2]),
    uploaded: 0,
    skipped: 0,
    ratePerMinute: 0,
    eta: 'dang-tinh',
    concurrency: Number(start[3])
  };
}

function touch(job) {
  job.updatedAt = new Date().toISOString();
}

function appendLog(job, line) {
  job.logs.push({
    at: new Date().toISOString(),
    text: cleanLog(line)
  });
  if (job.logs.length > MAX_LOG_LINES) job.logs.splice(0, job.logs.length - MAX_LOG_LINES);
}

function publicJob(job) {
  return {
    id: job.id,
    seriesId: job.seriesId,
    seriesSlug: job.seriesSlug,
    title: job.title,
    status: job.status,
    stepIndex: job.stepIndex,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    finishedAt: job.finishedAt,
    error: job.error,
    logs: job.logs,
    steps: job.steps.map(({ command, s3Step, ...step }) => step),
    result: job.result
  };
}

function trimLog(value) {
  const text = String(value || '');
  if (text.length <= MAX_LOG_TEXT) return text;
  return text.slice(text.length - MAX_LOG_TEXT);
}

function cleanLog(value) {
  let text = trimLog(value);
  for (const key of [
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'LIBSQL_AUTH_TOKEN',
    'ADMIN_PASSWORD',
    'ADMIN_TOKEN'
  ]) {
    const secret = process.env[key];
    if (secret) text = text.split(secret).join(`[redacted:${key}]`);
  }
  return text;
}
