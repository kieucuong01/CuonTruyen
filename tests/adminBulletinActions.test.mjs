import assert from 'node:assert/strict';
import test from 'node:test';

import { createAdminBulletinActions } from '../public/routes/adminBulletinActions.mjs';

function createStatus() {
  return {
    className: '',
    textContent: ''
  };
}

function createButton(dataset = {}, textContent = '') {
  return {
    dataset,
    disabled: false,
    listeners: {},
    textContent,
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    }
  };
}

function createForm({ text = 'Hello admin', pinned = false } = {}) {
  const submitButton = createButton({}, 'Send');
  return {
    listeners: {},
    resetCount: 0,
    submitButton,
    values: { text, pinned: pinned ? 'on' : '' },
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    querySelector(selector) {
      if (selector === 'button[type="submit"]') return submitButton;
      return null;
    },
    reset() {
      this.resetCount += 1;
    }
  };
}

function createActions(overrides = {}) {
  const status = createStatus();
  const calls = [];
  const flashes = [];
  let renderCount = 0;
  const controls = [];
  const app = {
    form: createForm(),
    pinButtons: [createButton({ adminBulletinPin: 'msg-1', pinned: 'false' }, 'Ghim')],
    querySelector(selector) {
      calls.push(['querySelector', selector]);
      if (selector === '[data-admin-bulletin-form]') return this.form;
      if (selector === '[data-admin-bulletin-status]') return status;
      return null;
    },
    querySelectorAll(selector) {
      calls.push(['querySelectorAll', selector]);
      if (selector === '[data-admin-bulletin-pin]') return this.pinButtons;
      return [];
    }
  };
  const actions = createAdminBulletinActions({
    adminHeaders: () => ({ authorization: 'Bearer admin' }),
    app,
    clearControlPending: () => controls.push(['clear']),
    fetchJson: async (url, options) => {
      calls.push(['fetchJson', url, options]);
      return {};
    },
    formDataFactory: (form) => ({
      get(name) {
        return form.values[name];
      }
    }),
    renderAdmin: async () => {
      renderCount += 1;
    },
    setAdminFlashMessage: (message) => flashes.push(message),
    setControlPending: (button) => controls.push(['pending', button]),
    ...overrides
  });
  return {
    actions,
    app,
    calls,
    controls,
    flashes,
    get renderCount() {
      return renderCount;
    },
    status
  };
}

test('admin bulletin bind wires form submit and pin buttons', () => {
  const { actions, app } = createActions();

  actions.bindAdminBulletinActions();

  assert.equal(typeof app.form.listeners.submit, 'function');
  assert.equal(typeof app.pinButtons[0].listeners.click, 'function');
});

test('admin bulletin submit posts message payload, resets form, flashes, and rerenders', async () => {
  const context = createActions();
  const { actions, app, calls, controls, flashes, status } = context;
  app.form.values = { text: 'Pinned news', pinned: 'on' };

  await actions.handleAdminBulletinSubmit({ preventDefault() {}, currentTarget: app.form });

  const fetchCall = calls.find((call) => call[0] === 'fetchJson');
  assert.equal(fetchCall[1], '/api/admin/bulletin/messages');
  assert.equal(fetchCall[2].method, 'POST');
  assert.deepEqual(fetchCall[2].headers, { authorization: 'Bearer admin' });
  assert.equal(fetchCall[2].body, '{"text":"Pinned news","pinned":true}');
  assert.equal(app.form.resetCount, 1);
  assert.deepEqual(flashes, ['Da gui tin admin.']);
  assert.equal(context.renderCount, 1);
  assert.equal(status.className, 'status-line');
  assert.equal(status.textContent, 'Dang gui tin admin...');
  assert.deepEqual(controls.map((item) => item[0]), ['pending', 'clear']);
});

test('admin bulletin pin toggles pinned state and rerenders', async () => {
  const context = createActions();
  const { actions, calls, flashes } = context;
  const button = createButton({ adminBulletinPin: 'msg 1', pinned: 'false' }, 'Ghim');

  await actions.handleAdminBulletinPin({ currentTarget: button });

  const fetchCall = calls.find((call) => call[0] === 'fetchJson');
  assert.equal(fetchCall[1], '/api/admin/bulletin/messages/msg%201');
  assert.equal(fetchCall[2].method, 'PATCH');
  assert.equal(fetchCall[2].body, '{"pinned":true}');
  assert.deepEqual(flashes, ['Da ghim tin admin.']);
  assert.equal(context.renderCount, 1);
  assert.equal(button.disabled, true);
});

test('admin bulletin actions render errors and restore controls when requests fail', async () => {
  const { actions, app, status } = createActions({
    fetchJson: async () => {
      throw new Error('network down');
    }
  });

  await actions.handleAdminBulletinSubmit({ preventDefault() {}, currentTarget: app.form });
  assert.equal(status.className, 'status-line error');
  assert.equal(status.textContent, 'network down');

  const button = createButton({ adminBulletinPin: 'msg-2', pinned: 'true' }, 'Bo ghim');
  await actions.handleAdminBulletinPin({ currentTarget: button });
  assert.equal(status.className, 'status-line error');
  assert.equal(status.textContent, 'network down');
  assert.equal(button.disabled, false);
});
