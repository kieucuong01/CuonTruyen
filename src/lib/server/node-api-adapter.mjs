import { Readable } from 'node:stream';

export function headersObjectFromNextRequest(request) {
  const headers = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
    headers[key.toLowerCase()] = value;
  });
  return headers;
}

export async function nodeApiHandlerAsNext(handler, request, { params = {}, query = {} } = {}) {
  const url = new URL(request.url || 'https://local.test/');
  const searchQuery = Object.fromEntries(url.searchParams.entries());
  const body = await nextRequestBodyBuffer(request);
  const req = Readable.from(body.length ? [body] : []);
  req.method = request.method || 'GET';
  req.url = `${url.pathname}${url.search}`;
  req.headers = headersObjectFromNextRequest(request);
  req.query = {
    ...searchQuery,
    ...query,
    ...params
  };

  const chunks = [];
  const responseHeaders = new Headers();
  const storedHeaders = new Map();
  const res = {
    statusCode: 200,
    setHeader(name, value) {
      setResponseHeader(responseHeaders, storedHeaders, name, value);
    },
    getHeader(name) {
      return storedHeaders.get(String(name || '').toLowerCase());
    },
    writeHead(statusCode, headers = {}) {
      this.statusCode = Number(statusCode || this.statusCode || 200);
      for (const [name, value] of Object.entries(headers || {})) {
        this.setHeader(name, value);
      }
    },
    write(chunk) {
      if (chunk !== undefined && chunk !== null) chunks.push(toBuffer(chunk));
      return true;
    },
    end(chunk) {
      if (chunk !== undefined && chunk !== null) chunks.push(toBuffer(chunk));
      this.writableEnded = true;
    },
    writableEnded: false
  };

  await handler(req, res);
  const status = Number(res.statusCode || 200);
  const responseBody = chunks.length ? Buffer.concat(chunks) : null;
  return new Response(status === 204 || status === 304 ? null : responseBody, {
    status,
    headers: responseHeaders
  });
}

async function nextRequestBodyBuffer(request) {
  if (request.method === 'GET' || request.method === 'HEAD') return Buffer.alloc(0);
  const raw = await request.arrayBuffer();
  return Buffer.from(raw);
}

function setResponseHeader(headers, storedHeaders, name, value) {
  const headerName = String(name || '');
  const key = headerName.toLowerCase();
  storedHeaders.set(key, value);
  headers.delete(headerName);
  const values = Array.isArray(value) ? value : [value];
  for (const item of values) {
    if (item === undefined || item === null) continue;
    if (key === 'set-cookie') headers.append(headerName, String(item));
    else headers.set(headerName, String(item));
  }
}

function toBuffer(chunk) {
  if (Buffer.isBuffer(chunk)) return chunk;
  if (chunk instanceof Uint8Array) return Buffer.from(chunk);
  return Buffer.from(String(chunk));
}
