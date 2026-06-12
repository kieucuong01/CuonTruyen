export function createAdminBulletinActions({
  adminHeaders,
  app,
  clearControlPending,
  fetchJson,
  formDataFactory = (form) => new FormData(form),
  renderAdmin,
  setAdminFlashMessage,
  setControlPending
} = {}) {
  function bindAdminBulletinActions() {
    app.querySelector('[data-admin-bulletin-form]')?.addEventListener('submit', handleAdminBulletinSubmit);
    app.querySelectorAll('[data-admin-bulletin-pin]').forEach((button) => button.addEventListener('click', handleAdminBulletinPin));
  }

  async function handleAdminBulletinSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const status = app.querySelector('[data-admin-bulletin-status]');
    const button = form.querySelector('button[type="submit"]');
    const formData = formDataFactory(form);
    setControlPending(button);
    if (status) {
      status.className = 'status-line';
      status.textContent = 'Dang gui tin admin...';
    }
    try {
      await fetchJson('/api/admin/bulletin/messages', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({
          text: formData.get('text'),
          pinned: formData.get('pinned') === 'on'
        })
      });
      form.reset();
      setAdminFlashMessage('Da gui tin admin.');
      await renderAdmin();
    } catch (error) {
      if (status) {
        status.className = 'status-line error';
        status.textContent = error.message;
      }
    } finally {
      clearControlPending();
    }
  }

  async function handleAdminBulletinPin(event) {
    const button = event.currentTarget;
    const messageId = button.dataset.adminBulletinPin;
    const pinned = button.dataset.pinned !== 'true';
    const status = app.querySelector('[data-admin-bulletin-status]');
    button.disabled = true;
    try {
      await fetchJson(`/api/admin/bulletin/messages/${encodeURIComponent(messageId)}`, {
        method: 'PATCH',
        headers: adminHeaders(),
        body: JSON.stringify({ pinned })
      });
      setAdminFlashMessage(pinned ? 'Da ghim tin admin.' : 'Da bo ghim tin admin.');
      await renderAdmin();
    } catch (error) {
      if (status) {
        status.className = 'status-line error';
        status.textContent = error.message;
      }
      button.disabled = false;
    }
  }

  return {
    bindAdminBulletinActions,
    handleAdminBulletinPin,
    handleAdminBulletinSubmit
  };
}
