'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildAdminChapterPatch,
  buildAdminSeriesPatch,
  buildCrawlSchedulePatch,
  chapterEditorRows,
  findAdminSeriesForEditor,
  formStateFromSeries
} from './adminSeriesEditorState.mjs';

const ADMIN_TOKEN_KEY = 'comic-admin-token';
const ADMIN_EMAIL_KEY = 'comic-admin-email';

type EditorStatus = 'checking' | 'login' | 'loading' | 'ready' | 'error' | 'saving';

export function AdminSeriesEditorIsland({ seriesId }: { seriesId: string }) {
  const [status, setStatus] = useState<EditorStatus>('checking');
  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [series, setSeries] = useState<Record<string, any> | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [chapterForm, setChapterForm] = useState<Record<string, any>>({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadSeries = useCallback(async (sessionToken: string) => {
    setStatus('loading');
    setError('');
    try {
      const catalog = await fetchAdminJson('/api/admin/catalog', { token: sessionToken });
      const nextSeries = findAdminSeriesForEditor(catalog, seriesId);
      if (!nextSeries) {
        setSeries(null);
        setStatus('error');
        setError('Không tìm thấy truyện trong catalog admin.');
        return;
      }
      setSeries(nextSeries);
      setForm(formStateFromSeries(nextSeries));
      setChapterForm(chapterFieldsFromSeries(nextSeries));
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
      setError(err?.message || 'Không tải được truyện admin.');
    }
  }, [seriesId]);

  useEffect(() => {
    const stored = readStoredAdminSession();
    if (!stored.token) {
      setEmail(stored.email);
      setStatus('login');
      return;
    }
    setToken(stored.token);
    setEmail(stored.email);
    void loadSeries(stored.token);
  }, [loadSeries]);

  const chapters = useMemo(() => chapterEditorRows(series || {}), [series]);
  const busy = status === 'loading' || status === 'saving';
  const stableSeriesId = String(series?.id || series?.slug || seriesId || '').trim();

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
      await loadSeries(nextToken);
    } catch (err: any) {
      setStatus('login');
      setError(err?.message || 'Không đăng nhập được admin.');
    }
  }

  async function handleMetadataSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stableSeriesId) return;
    setStatus('saving');
    setError('');
    setMessage('');
    try {
      await fetchAdminJson(`/api/admin/series/${encodeURIComponent(stableSeriesId)}`, {
        method: 'PATCH',
        token,
        body: buildAdminSeriesPatch(form)
      });
      for (const chapter of chapters) {
        await fetchAdminJson(`/api/admin/series/${encodeURIComponent(stableSeriesId)}/chapters/${encodeURIComponent(chapter.id)}`, {
          method: 'PATCH',
          token,
          body: buildAdminChapterPatch(chapter.id, chapterForm)
        });
      }
      setMessage('Đã lưu metadata và trạng thái chapter.');
      await loadSeries(token);
    } catch (err: any) {
      setStatus('ready');
      setError(err?.message || 'Không lưu được truyện.');
    }
  }

  async function handleScheduleSave() {
    if (!stableSeriesId) return;
    setStatus('saving');
    setError('');
    setMessage('');
    try {
      await fetchAdminJson(`/api/admin/series/${encodeURIComponent(stableSeriesId)}/crawl-schedule`, {
        method: 'POST',
        token,
        body: buildCrawlSchedulePatch(form)
      });
      setMessage('Đã lưu lịch crawl metadata. Crawler vẫn chạy ở local/worker.');
      await loadSeries(token);
    } catch (err: any) {
      setStatus('ready');
      setError(err?.message || 'Không lưu được lịch crawl.');
    }
  }

  function handleLogout() {
    clearStoredAdminSession();
    setToken('');
    setPassword('');
    setSeries(null);
    setStatus('login');
  }

  if (status === 'checking') {
    return (
      <main className="next-shell next-admin-shell" data-next-admin-series-editor>
        <p className="next-admin-status">Đang kiểm tra phiên admin...</p>
      </main>
    );
  }

  if (status === 'login') {
    return (
      <main className="next-shell next-admin-shell" data-next-admin-series-editor>
        <section className="next-admin-login" data-next-admin-login>
          <Link className="next-brand" href="/">Cuộn Truyện</Link>
          <h1>Đăng nhập admin</h1>
          {error ? <p className="next-admin-error">{error}</p> : null}
          <form onSubmit={handleLogin} className="next-admin-form">
            <label>
              Email admin
              <input autoComplete="username" name="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label>
              Mật khẩu
              <input autoComplete="current-password" name="password" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            <button className="next-admin-primary" type="submit">Đăng nhập</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="next-shell next-admin-shell" data-next-admin-series-editor aria-busy={busy}>
      <header className="next-admin-topbar">
        <div>
          <Link className="next-brand" href="/admin">Admin nội dung</Link>
          <p className="next-muted">{series?.title || 'Quản lý truyện'}</p>
        </div>
        <div className="next-admin-actions">
          <span className="next-muted">{email}</span>
          <button className="next-admin-secondary" type="button" onClick={() => void loadSeries(token)} disabled={!token || busy}>
            Làm mới
          </button>
          <button className="next-admin-secondary" type="button" onClick={handleLogout}>
            Đăng xuất
          </button>
        </div>
      </header>

      <section className="next-admin-notice">
        Trang này chỉ sửa metadata, trạng thái truyện/chapter và lịch crawl metadata. Crawl, S3 sync và publish production vẫn chạy ở admin local.
      </section>

      {error ? <p className="next-admin-error">{error}</p> : null}
      {message ? <p className="next-admin-status">{message}</p> : null}
      {status === 'loading' ? <p className="next-admin-status">Đang tải truyện...</p> : null}

      {series ? (
        <form className="next-admin-editor" onSubmit={handleMetadataSave}>
          <section className="next-admin-panel">
            <div className="next-admin-panel-head">
              <div>
                <h1>{series.title || 'Truyện chưa đặt tên'}</h1>
                <p className="next-muted">{chapters.length.toLocaleString('vi-VN')} chapter trong catalog admin</p>
              </div>
              {series.slug ? <Link className="next-admin-secondary" href={`/truyen/${encodeURIComponent(series.slug)}`}>Mở public</Link> : null}
            </div>
            <div className="next-admin-editor-grid">
              <TextField label="Tiêu đề" name="title" value={form.title} onChange={setFormValue} />
              <TextField label="Slug" name="slug" value={form.slug} onChange={setFormValue} />
              <SelectField label="Trạng thái" name="status" value={form.status} onChange={setFormValue} />
              <TextField label="Cover URL" name="coverUrl" value={form.coverUrl} onChange={setFormValue} />
              <TextField label="Aliases" name="aliases" value={form.aliases} onChange={setFormValue} />
              <TextField label="Tags" name="tags" value={form.tags} onChange={setFormValue} />
              <label className="next-admin-field">
                Phân loại quốc gia
                <select value={form.originType || ''} onChange={(event) => setFormValue('originType', event.target.value)}>
                  <option value="">Chưa rõ</option>
                  <option value="manhwa">Truyện Hàn</option>
                  <option value="manhua">Truyện Trung</option>
                </select>
              </label>
              <label className="next-admin-field next-admin-wide">
                Mô tả SEO
                <textarea rows={5} value={form.description || ''} onChange={(event) => setFormValue('description', event.target.value)} />
              </label>
            </div>
          </section>

          <section className="next-admin-panel">
            <div className="next-admin-panel-head">
              <div>
                <h2>Lịch crawl metadata</h2>
                <p className="next-muted">Chỉ lưu cấu hình để worker local đọc, không chạy crawler trên Vercel.</p>
              </div>
              <button className="next-admin-secondary" type="button" onClick={() => void handleScheduleSave()} disabled={busy}>
                Lưu lịch
              </button>
            </div>
            <div className="next-admin-editor-grid">
              <label className="next-admin-check">
                <input type="checkbox" checked={Boolean(form.scheduleEnabled)} onChange={(event) => setFormValue('scheduleEnabled', event.target.checked)} />
                Auto crawl
              </label>
              <TextField label="Interval giờ" name="intervalHours" type="number" value={form.intervalHours} onChange={setFormValue} />
            </div>
          </section>

          <section className="next-admin-panel">
            <div className="next-admin-panel-head">
              <div>
                <h2>Duyệt chapter</h2>
                <p className="next-muted">Ẩn chapter lỗi hoặc chưa muốn public, không xóa ảnh cache.</p>
              </div>
              <button className="next-admin-primary" type="submit" disabled={busy}>
                Lưu thay đổi
              </button>
            </div>
            <div className="next-admin-chapter-list">
              {chapters.map((chapter) => (
                <article key={chapter.id} className="next-admin-chapter-row">
                  <input
                    aria-label="Tên chapter"
                    value={chapterForm[`chapterTitle:${chapter.id}`] || ''}
                    onChange={(event) => setChapterFormValue(`chapterTitle:${chapter.id}`, event.target.value)}
                  />
                  <select
                    value={chapterForm[`chapterStatus:${chapter.id}`] || 'draft'}
                    onChange={(event) => setChapterFormValue(`chapterStatus:${chapter.id}`, event.target.value)}
                  >
                    <option value="public">Public</option>
                    <option value="draft">Draft</option>
                    <option value="removed">Removed</option>
                  </select>
                  <input
                    aria-label="Lý do ẩn"
                    placeholder="Lý do ẩn"
                    value={chapterForm[`chapterReason:${chapter.id}`] || ''}
                    onChange={(event) => setChapterFormValue(`chapterReason:${chapter.id}`, event.target.value)}
                  />
                  {chapter.href ? <Link className="next-admin-secondary" href={chapter.href} prefetch={false}>Mở</Link> : null}
                </article>
              ))}
              {!chapters.length ? <p className="next-admin-empty">Chưa có chapter.</p> : null}
            </div>
          </section>
        </form>
      ) : null}
    </main>
  );

  function setFormValue(name: string, value: any) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function setChapterFormValue(name: string, value: any) {
    setChapterForm((current) => ({ ...current, [name]: value }));
  }
}

function TextField({
  label,
  name,
  type = 'text',
  value,
  onChange
}: {
  label: string;
  name: string;
  type?: string;
  value: any;
  onChange: (name: string, value: any) => void;
}) {
  return (
    <label className="next-admin-field">
      {label}
      <input type={type} value={value || ''} onChange={(event) => onChange(name, event.target.value)} />
    </label>
  );
}

function SelectField({
  label,
  name,
  value,
  onChange
}: {
  label: string;
  name: string;
  value: string;
  onChange: (name: string, value: string) => void;
}) {
  return (
    <label className="next-admin-field">
      {label}
      <select value={value || 'draft'} onChange={(event) => onChange(name, event.target.value)}>
        <option value="public">Public</option>
        <option value="draft">Draft</option>
        <option value="removed">Removed</option>
      </select>
    </label>
  );
}

function chapterFieldsFromSeries(series: Record<string, any>) {
  const fields: Record<string, any> = {};
  for (const chapter of chapterEditorRows(series)) {
    fields[`chapterTitle:${chapter.id}`] = chapter.title;
    fields[`chapterStatus:${chapter.id}`] = chapter.status;
    fields[`chapterReason:${chapter.id}`] = chapter.takedownReason;
  }
  return fields;
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
