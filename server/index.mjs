import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getSeries, IMPORT_ROOT, readCatalog } from './catalogStore.mjs';
import { createImportJob, getImportJob } from './importJobs.mjs';
import { jsonResponse, mimeFromPath, readJsonBody } from './utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 4173);

function cleanRelativePath(urlPath, prefix = '') {
  const decoded = decodeURIComponent(urlPath.replace(prefix, ''));
  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  return normalized.replace(/^[/\\]+/, '');
}

async function sendFile(res, filePath) {
  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, {
      'content-type': mimeFromPath(filePath),
      'cache-control': filePath.includes(`${path.sep}imports${path.sep}`) ? 'public, max-age=31536000' : 'no-cache'
    });
    res.end(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    throw error;
  }
}

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/series') {
    const catalog = await readCatalog();
    jsonResponse(res, 200, catalog);
    return true;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/series/')) {
    const id = decodeURIComponent(url.pathname.replace('/api/series/', ''));
    const series = await getSeries(id);
    jsonResponse(res, series ? 200 : 404, series || { error: 'Series not found' });
    return true;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/import/')) {
    const id = decodeURIComponent(url.pathname.replace('/api/import/', ''));
    const job = getImportJob(id);
    jsonResponse(res, job ? 200 : 404, job || { error: 'Import job not found' });
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/import') {
    try {
      const body = await readJsonBody(req);
      if (!body.url || !/^https?:\/\//i.test(body.url)) {
        jsonResponse(res, 400, { error: 'Vui lòng nhập URL truyện hợp lệ.' });
        return true;
      }
      const job = createImportJob({
        url: body.url,
        maxChapters: body.maxChapters || 2,
        maxPages: body.maxPages || 8
      });
      job.done.catch(() => {});
      jsonResponse(res, 202, { job: getImportJob(job.id) });
    } catch (error) {
      const message = error.message?.startsWith('Source returned')
        ? 'Nguồn đang trả trang lỗi hoặc chặn crawler, chưa thể lấy ảnh truyện lúc này.'
        : error.message;
      jsonResponse(res, 500, {
        error: message || 'Không thể import truyện.',
        hint: 'Nguồn có thể chặn crawler hoặc cấu trúc trang đã thay đổi.'
      });
    }
    return true;
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (await handleApi(req, res, url)) return;

    if (url.pathname.startsWith('/imports/')) {
      const rel = cleanRelativePath(url.pathname, '/imports/');
      await sendFile(res, path.join(IMPORT_ROOT, rel));
      return;
    }

    const rel = cleanRelativePath(url.pathname === '/' ? '/index.html' : url.pathname);
    const filePath = path.join(PUBLIC_DIR, rel);
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    await sendFile(res, filePath);
  } catch (error) {
    console.error(error);
    jsonResponse(res, 500, { error: 'Server error', detail: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Comic reader running at http://localhost:${PORT}`);
});
