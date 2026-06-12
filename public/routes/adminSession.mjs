const ADMIN_TOKEN_KEY = 'comic-admin-token';
const ADMIN_EMAIL_KEY = 'comic-admin-email';
const DEFAULT_ADMIN_EMAIL = '';

const adminSessionMemory = {
  token: '',
  email: ''
};

export function loadAdminToken() {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY) || adminSessionMemory.token || '';
  } catch {
    return adminSessionMemory.token || '';
  }
}

export function loadAdminEmail() {
  try {
    return localStorage.getItem(ADMIN_EMAIL_KEY) || adminSessionMemory.email || DEFAULT_ADMIN_EMAIL;
  } catch {
    return adminSessionMemory.email || DEFAULT_ADMIN_EMAIL;
  }
}

export function saveAdminSession(session) {
  adminSessionMemory.token = String(session?.token || '').trim();
  adminSessionMemory.email = String(session?.email || DEFAULT_ADMIN_EMAIL).trim();
  try {
    if (adminSessionMemory.token) localStorage.setItem(ADMIN_TOKEN_KEY, adminSessionMemory.token);
    if (adminSessionMemory.email) localStorage.setItem(ADMIN_EMAIL_KEY, adminSessionMemory.email);
  } catch {}
}

export function clearAdminSession() {
  adminSessionMemory.token = '';
  adminSessionMemory.email = '';
  try {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_EMAIL_KEY);
  } catch {}
}
