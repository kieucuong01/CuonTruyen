import assert from 'node:assert/strict';
import test from 'node:test';

import { createAdminAuthActions } from '../public/routes/adminAuthActions.mjs';

function createStatus() {
  return {
    className: '',
    textContent: ''
  };
}

function createButton() {
  return {
    disabled: false
  };
}

function createForm(values = {}) {
  const button = createButton();
  return {
    button,
    values: {
      email: 'admin@example.test',
      password: 'secret',
      ...values
    },
    querySelector(selector) {
      if (selector === 'button[type="submit"]') return button;
      return null;
    }
  };
}

function createClickable() {
  return {
    listeners: {},
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    }
  };
}

function createActions(overrides = {}) {
  const logoutButton = createClickable();
  const loginForm = createClickable();
  const status = createStatus();
  const calls = [];
  const controls = [];
  const cleared = [];
  const saved = [];
  let routeCount = 0;
  const app = {
    querySelector(selector) {
      calls.push(['querySelector', selector]);
      if (selector === '[data-admin-logout]') return logoutButton;
      if (selector === '[data-admin-login-form]') return loginForm;
      if (selector === '[data-status]') return status;
      return null;
    }
  };
  const actions = createAdminAuthActions({
    app,
    clearAdminSession: () => cleared.push('clear'),
    clearControlPending: () => controls.push(['clear']),
    fetchJson: async (url, options) => {
      calls.push(['fetchJson', url, options]);
      return { token: 'token-1', email: 'admin@example.test' };
    },
    formDataFactory: (form) => ({
      get(name) {
        return form.values[name];
      }
    }),
    route: async () => {
      routeCount += 1;
    },
    saveAdminSession: (session) => saved.push(session),
    setControlPending: (button) => controls.push(['pending', button]),
    ...overrides
  });
  return {
    actions,
    app,
    calls,
    cleared,
    controls,
    get routeCount() {
      return routeCount;
    },
    loginForm,
    logoutButton,
    saved,
    status
  };
}

test('admin auth actions bind logout and login controls', () => {
  const { actions, loginForm, logoutButton } = createActions();

  actions.bindAdminCommonActions();
  actions.bindAdminLoginForm();

  assert.equal(typeof logoutButton.listeners.click, 'function');
  assert.equal(typeof loginForm.listeners.submit, 'function');
});

test('admin logout clears the session and routes back through admin', () => {
  const context = createActions();

  context.actions.bindAdminCommonActions();
  context.logoutButton.listeners.click();

  assert.deepEqual(context.cleared, ['clear']);
  assert.equal(context.routeCount, 1);
});

test('admin login posts credentials, saves the session, routes, and clears pending state', async () => {
  const context = createActions();
  const form = createForm();

  await context.actions.handleAdminLogin({ preventDefault() {}, currentTarget: form });

  const fetchCall = context.calls.find((call) => call[0] === 'fetchJson');
  assert.equal(fetchCall[1], '/api/admin/login');
  assert.equal(fetchCall[2].method, 'POST');
  assert.deepEqual(fetchCall[2].headers, { 'content-type': 'application/json' });
  assert.equal(fetchCall[2].body, '{"email":"admin@example.test","password":"secret"}');
  assert.deepEqual(context.saved, [{ token: 'token-1', email: 'admin@example.test' }]);
  assert.equal(context.routeCount, 1);
  assert.equal(context.status.className, 'status-line');
  assert.equal(context.status.textContent, 'Đang đăng nhập...');
  assert.deepEqual(context.controls.map((item) => item[0]), ['pending', 'clear']);
});

test('admin login renders request errors and still clears pending state', async () => {
  const context = createActions({
    fetchJson: async () => {
      throw new Error('bad login');
    }
  });

  await context.actions.handleAdminLogin({ preventDefault() {}, currentTarget: createForm() });

  assert.equal(context.status.className, 'status-line error');
  assert.equal(context.status.textContent, 'bad login');
  assert.deepEqual(context.saved, []);
  assert.equal(context.routeCount, 0);
  assert.deepEqual(context.controls.map((item) => item[0]), ['pending', 'clear']);
});
