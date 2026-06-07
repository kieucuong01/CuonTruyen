'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  adminDashboardSeriesStats,
  adminDashboardTotals,
  adminSeriesAdminHref
} from './adminDashboardState.mjs';

const ADMIN_TOKEN_KEY = 'comic-admin-token';
const ADMIN_EMAIL_KEY = 'comic-admin-email';

type AdminCatalog = {
  series?: Array<Record<string, any>>;
};

type AdminDashboardStatus = 'checking' | 'login' | 'loading' | 'ready' | 'error';

export function AdminDashboardIsland() {
  const [status, setStatus] = useState<AdminDashboardStatus>('checking');
  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [catalog, setCatalog] = useState<AdminCatalog>({});
  const [analytics, setAnalytics] = useState<any>(null);
  const [messages, setMessages] = useState<Array<Record<string, any>>>([]);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async (sessionToken: string) => {
    setStatus('loading');
    setError('');
    try {
      const catalogData = await fetchAdminJson('/api/admin/catalog', { token: sessionToken });
      setCatalog(catalogData);

      const [analyticsResult, bulletinResult] = await Promise.allSettled([
        fetchAdminJson('/api/admin/analytics/summary?range=30d', { token: sessionToken }),
        fetchAdminJson('/api/admin/bulletin/messages?limit=20', { token: sessionToken })
      ]);
      setAnalytics(analyticsResult.status === 'fulfilled' ? analyticsResult.value : null);
      setMessages(bulletinResult.status === 'fulfilled' ? (bulletinResult.value.messages || []) : []);
      setStatus('ready');
    } catch (err: any) {
      if (err?.status === 401) {
        clearStoredAdminSession();
        setToken('');
        setStatus('login');
        setError('Phiên admin đã hết hạn, vui lòng đăng nhập lại.');
        return;
      }
      setStatus('error');
      setError(err?.message || 'Không tải được dashboard admin.');
    }
  }, []);

  useEffect(() => {
    const stored = readStoredAdminSession();
    if (!stored.token) {
      setStatus('login');
      setEmail(stored.email);
      return;
    }
    setToken(stored.token);
    setEmail(stored.email);
    void loadDashboard(stored.token);
  }, [loadDashboard]);

  const seriesList = Array.isArray(catalog.series) ? catalog.series : [];
  const totals = useMemo(() => adminDashboardTotals(seriesList), [seriesList]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('loading');
    setError('');
    try {
      const session = await fetchAdminJson('/api/admin/session', {
        method: 'POST',
        body: { email, password }
      });
      const nextToken = String(session.token || '').trim();
      const nextEmail = String(session.email || email || '').trim();
      if (!nextToken) throw new Error('API đăng nhập không trả session token.');
      storeAdminSession({ token: nextToken, email: nextEmail });
      setToken(nextToken);
      setEmail(nextEmail);
      setPassword('');
      await loadDashboard(nextToken);
    } catch (err: any) {
      setStatus('login');
      setError(err?.message || 'Không đăng nhập được admin.');
    }
  }

  function handleLogout() {
    clearStoredAdminSession();
    setToken('');
    setPassword('');
    setCatalog({});
    setAnalytics(null);
    setMessages([]);
    setStatus('login');
  }

  if (status === 'checking') {
    return (
      <main className="next-shell next-admin-shell" data-next-admin-dashboard>
        <p className="next-admin-status">Đang kiểm tra phiên admin...</p>
      </main>
    );
  }

  if (status === 'login') {
    return (
      <main className="next-shell next-admin-shell" data-next-admin-dashboard>
        <section className="next-admin-login" data-next-admin-login>
          <Link className="next-brand" href="/">Cuộn Truyện</Link>
          <h1>Đăng nhập admin</h1>
          {error ? <p className="next-admin-error">{error}</p> : null}
          <form onSubmit={handleLogin} className="next-admin-form">
            <label>
              Email admin
              <input
                autoComplete="username"
                name="email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label>
              Mật khẩu
              <input
                autoComplete="current-password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <button className="next-admin-primary" type="submit">Đăng nhập</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="next-shell next-admin-shell" data-next-admin-dashboard aria-busy={status === 'loading'}>
      <header className="next-admin-topbar">
        <div>
          <Link className="next-brand" href="/">Cuộn Truyện</Link>
          <p className="next-muted">Admin nội dung</p>
        </div>
        <div className="next-admin-actions">
          <span className="next-muted">{email}</span>
          <button className="next-admin-secondary" type="button" onClick={() => void loadDashboard(token)} disabled={!token || status === 'loading'}>
            Làm mới
          </button>
          <button className="next-admin-secondary" type="button" onClick={handleLogout}>
            Đăng xuất
          </button>
        </div>
      </header>

      <section className="next-admin-notice">
        Production admin chỉ quản lý nội dung. Crawl, tối ưu ảnh và đồng bộ ảnh vẫn chạy ở admin local.
      </section>

      {error ? <p className="next-admin-error">{error}</p> : null}
      {status === 'loading' ? <p className="next-admin-status">Đang tải catalog admin...</p> : null}

      <section className="next-admin-metrics" aria-label="Tổng quan nội dung">
        <Metric label="Truyện" value={totals.series} />
        <Metric label="Đang public" value={totals.publicSeries} />
        <Metric label="Chương public" value={totals.publicChapters} />
        <Metric label="Ẩn/nháp" value={totals.hiddenChapters} />
      </section>

      <section className="next-admin-layout">
        <div className="next-admin-panel">
          <div className="next-admin-panel-head">
            <h1>Catalog</h1>
            <span className="next-muted">{seriesList.length.toLocaleString('vi-VN')} truyện</span>
          </div>
          <div className="next-admin-series-list">
            {seriesList.slice(0, 80).map((series) => (
              <SeriesRow key={series.id || series.slug || series.title} series={series} />
            ))}
          </div>
          {!seriesList.length && status === 'ready' ? <p className="next-admin-empty">Chưa có truyện để quản lý.</p> : null}
        </div>

        <aside className="next-admin-side">
          <section className="next-admin-panel">
            <h2>Doanh thu và lượt đọc</h2>
            <p className="next-admin-large">
              {Number(analytics?.totals?.reads || analytics?.reads || 0).toLocaleString('vi-VN')}
            </p>
            <p className="next-muted">lượt đọc trong 30 ngày</p>
          </section>

          <section className="next-admin-panel">
            <h2>Thông báo admin</h2>
            <div className="next-admin-message-list">
              {messages.slice(0, 5).map((message) => (
                <p key={message.id || message.createdAt} className="next-admin-message">
                  {message.pinned ? <strong>Ghim: </strong> : null}
                  {message.text || message.message || ''}
                </p>
              ))}
              {!messages.length ? <p className="next-muted">Chưa có thông báo.</p> : null}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="next-admin-metric">
      <strong>{Number(value || 0).toLocaleString('vi-VN')}</strong>
      <span>{label}</span>
    </div>
  );
}

function SeriesRow({ series }: { series: Record<string, any> }) {
  const stats = adminDashboardSeriesStats(series);
  return (
    <article className="next-admin-series-row">
      <div>
        <Link href={adminSeriesAdminHref(series)} prefetch={false}>{series.title || 'Truyện chưa đặt tên'}</Link>
        <p className="next-muted">
          {stats.publicChapters.toLocaleString('vi-VN')} public / {stats.totalChapters.toLocaleString('vi-VN')} chương
        </p>
      </div>
      <span className={`next-admin-badge is-${stats.status}`}>{stats.status}</span>
    </article>
  );
}

async function fetchAdminJson(path: string, options: { token?: string; method?: string; body?: any } = {}) {
  const response = await fetch(path, {
    method: options.method || 'GET',
    headers: {
      'content-type': 'application/json',
      ...(options.token ? { 'x-admin-token': options.token } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const error: any = new Error(data.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function readStoredAdminSession() {
  try {
    return {
      token: window.localStorage.getItem(ADMIN_TOKEN_KEY) || '',
      email: window.localStorage.getItem(ADMIN_EMAIL_KEY) || ''
    };
  } catch {
    return { token: '', email: '' };
  }
}

function storeAdminSession(session: { token: string; email: string }) {
  try {
    window.localStorage.setItem(ADMIN_TOKEN_KEY, session.token);
    window.localStorage.setItem(ADMIN_EMAIL_KEY, session.email);
  } catch {
    // Restricted storage still keeps the in-memory React state for this tab.
  }
}

function clearStoredAdminSession() {
  try {
    window.localStorage.removeItem(ADMIN_TOKEN_KEY);
    window.localStorage.removeItem(ADMIN_EMAIL_KEY);
  } catch {
    // Ignore restricted storage.
  }
}
