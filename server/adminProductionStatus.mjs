export function isImportAssetReference(value = '') {
  const raw = String(value || '').trim();
  return raw.startsWith('/imports/') || raw.startsWith('imports/') || raw.includes('/imports/');
}

export function productionStatusLabel(state) {
  if (state === 'ok') return 'Production OK';
  if (state === 'syncing') return 'Đang sync';
  if (state === 'missing-images') return 'Thiếu ảnh S3';
  if (state === 'not-public') return 'Chưa public';
  return 'Chưa kiểm tra';
}

export function estimateProductionImageTotal(series = {}) {
  const pageCount = Number(series.pageCount || 0);
  const coverCount = [
    series.thumbnailUrl,
    series.coverThumbnailUrl,
    series.coverThumb,
    series.coverUrl,
    series.imageUrl
  ].some(isImportAssetReference) ? 1 : 0;
  return Math.max(0, pageCount) + coverCount;
}

export function buildAdminProductionStatus(
  catalog = {},
  syncState = {},
  syncStatus = {},
  storage = {}
) {
  const objects = syncState.objects || {};
  const keys = Object.keys(objects);
  const importKeyCounts = new Map();

  for (const key of keys) {
    if (key.startsWith('imports/')) {
      const seriesId = key.split('/')[1] || '';
      if (seriesId) importKeyCounts.set(seriesId, (importKeyCounts.get(seriesId) || 0) + 1);
    }
  }

  const statuses = {};
  for (const series of catalog.series || []) {
    const seriesId = String(series.id || '').trim();
    if (!seriesId) continue;
    const imageTotal = estimateProductionImageTotal(series);
    const imageUploaded = importKeyCounts.get(seriesId) || 0;
    const syncMatchesSeries = syncStatus?.status === 'running' && String(syncStatus.seriesId || '') === seriesId;
    const imagesOk = imageTotal > 0 && imageUploaded >= imageTotal;
    let state = 'unchecked';

    if (String(series.status || 'draft') !== 'public') {
      state = 'not-public';
    } else if (syncMatchesSeries) {
      state = 'syncing';
    } else if (!imagesOk) {
      state = 'missing-images';
    } else {
      state = 'ok';
    }

    statuses[seriesId] = {
      state,
      label: productionStatusLabel(state),
      summary: imagesOk ? 'Ảnh production đã có trong S3 state.' : '',
      images: {
        uploaded: imageUploaded,
        total: imageTotal,
        missing: Math.max(0, imageTotal - imageUploaded)
      },
      sync: syncMatchesSeries ? {
        checked: Number(syncStatus.checked || 0),
        total: Number(syncStatus.total || 0),
        percent: Number(syncStatus.percent || 0),
        eta: syncStatus.eta || ''
      } : null,
      updatedAt: syncState.updatedAt || ''
    };
  }

  return {
    updatedAt: syncState.updatedAt || '',
    stateFileExists: true,
    storage,
    statuses
  };
}
