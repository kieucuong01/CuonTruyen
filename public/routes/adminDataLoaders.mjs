export function createAdminDataLoaders({ adminHeaders, fetchJson } = {}) {
  async function loadAdminCatalog() {
    return fetchJson('/api/admin/series', { headers: adminHeaders() });
  }

  async function loadAdminBulletin() {
    return fetchJson('/api/admin/bulletin/messages?limit=40', { headers: adminHeaders() })
      .catch(() => ({ messages: [] }));
  }

  async function loadAdminAnalytics(range = '30d') {
    return fetchJson(`/api/admin/analytics/summary?range=${encodeURIComponent(range)}`, { headers: adminHeaders() })
      .catch(() => null);
  }

  async function loadAdminProductionStatus() {
    return fetchJson('/api/admin/production-status', { headers: adminHeaders() })
      .catch(() => ({ statuses: {}, stateFileExists: false }));
  }

  return {
    loadAdminAnalytics,
    loadAdminBulletin,
    loadAdminCatalog,
    loadAdminProductionStatus
  };
}
