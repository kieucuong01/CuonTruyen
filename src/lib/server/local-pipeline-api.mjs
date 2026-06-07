import { nextAdminContentAction } from './admin-content-api.mjs';

export function localPipelineUnavailablePayload(feature = 'Local pipeline') {
  return {
    ok: false,
    error: `${feature} chỉ chạy ở admin local/crawler, không chạy trên Vercel production.`,
    hint: 'Mở admin local bằng npm run dev để chạy crawler, import, S3 sync hoặc production publish.'
  };
}

export async function nextLocalPipelineUnavailableApi(request, feature, options = {}) {
  const result = {
    status: 503,
    body: localPipelineUnavailablePayload(feature)
  };

  if (options.requireAdmin === false) {
    return result;
  }

  return nextAdminContentAction(request, async () => result);
}
