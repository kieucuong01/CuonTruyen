function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export default function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type, x-admin-token, authorization');
    res.end();
    return;
  }

  sendJson(res, 503, {
    error: 'Admin API ch\u01b0a ch\u1ea1y tr\u00ean Vercel.',
    detail: 'Admin/crawler hi\u1ec7n ch\u1ec9 d\u00f9ng v\u1edbi backend local ho\u1eb7c VPS. H\u00e3y m\u1edf admin local, v\u00ed d\u1ee5 http://localhost:54533/admin, khi backend Node \u0111ang ch\u1ea1y.'
  });
}
