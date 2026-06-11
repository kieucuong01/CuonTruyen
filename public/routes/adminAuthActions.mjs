import {
  clearAdminSession as defaultClearAdminSession,
  saveAdminSession as defaultSaveAdminSession
} from './adminSession.mjs';

export function createAdminAuthActions({
  app,
  clearAdminSession = defaultClearAdminSession,
  clearControlPending,
  fetchJson,
  formDataFactory = (form) => new FormData(form),
  route,
  saveAdminSession = defaultSaveAdminSession,
  setControlPending
} = {}) {
  function bindAdminCommonActions() {
    app.querySelector('[data-admin-logout]')?.addEventListener('click', () => {
      clearAdminSession();
      route();
    });
  }

  function bindAdminLoginForm() {
    app.querySelector('[data-admin-login-form]').addEventListener('submit', handleAdminLogin);
  }

  async function handleAdminLogin(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const status = app.querySelector('[data-status]');
    const formData = formDataFactory(form);
    setControlPending(button);
    if (status) {
      status.className = 'status-line';
      status.textContent = 'Đang đăng nhập...';
    }

    try {
      const session = await fetchJson('/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: formData.get('email'),
          password: formData.get('password')
        })
      });
      saveAdminSession(session);
      await route();
    } catch (error) {
      if (status) {
        status.className = 'status-line error';
        status.textContent = error.message;
      }
    } finally {
      clearControlPending();
    }
  }

  return {
    bindAdminCommonActions,
    bindAdminLoginForm,
    handleAdminLogin
  };
}
