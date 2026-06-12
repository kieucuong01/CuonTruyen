import assert from 'node:assert/strict';
import test from 'node:test';

import { createAdminRevenueActions } from '../public/routes/adminRevenueActions.mjs';

function createButton(range = '30d') {
  return {
    dataset: { analyticsRange: range },
    disabled: false,
    listeners: {},
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    }
  };
}

function createDashboard(buttons = []) {
  return {
    htmlInserts: [],
    outerHTML: '<section data-revenue-dashboard></section>',
    querySelectorAll(selector) {
      assert.equal(selector, '[data-analytics-range]');
      return buttons;
    },
    insertAdjacentHTML(position, html) {
      this.htmlInserts.push({ position, html });
    }
  };
}

function createActions(overrides = {}) {
  const firstButton = createButton('7d');
  const secondButton = createButton('all');
  const dashboard = createDashboard([firstButton, secondButton]);
  const reboundDashboard = createDashboard([]);
  const calls = [];
  const app = {
    queryCount: 0,
    querySelector(selector) {
      calls.push(['querySelector', selector]);
      if (selector !== '[data-revenue-dashboard]') return null;
      this.queryCount += 1;
      return this.queryCount === 1 ? dashboard : reboundDashboard;
    }
  };
  const actions = createAdminRevenueActions({
    app,
    escapeHtml: (value) => String(value).replace(/</g, '&lt;'),
    loadAdminAnalytics: async (range) => {
      calls.push(['loadAdminAnalytics', range]);
      return { range, totals: {}, topSeries: [] };
    },
    renderRevenueDashboard: (summary) => `<section data-revenue-dashboard>${summary.range}</section>`,
    ...overrides
  });
  return {
    actions,
    app,
    calls,
    dashboard,
    firstButton,
    reboundDashboard,
    secondButton
  };
}

test('admin revenue actions bind range buttons and refresh dashboard after loading analytics', async () => {
  const { actions, calls, dashboard, firstButton } = createActions();

  actions.bindRevenueDashboard();
  assert.equal(typeof firstButton.listeners.click, 'function');

  await firstButton.listeners.click({ currentTarget: firstButton });

  assert.equal(calls.some((call) => call[0] === 'loadAdminAnalytics' && call[1] === '7d'), true);
  assert.equal(dashboard.outerHTML, '<section data-revenue-dashboard>7d</section>');
  assert.equal(firstButton.disabled, false);
  assert.equal(calls.filter((call) => call[0] === 'querySelector').length, 2);
});

test('admin revenue actions use the default range and escape load errors', async () => {
  const defaultButton = createButton('');
  const dashboard = createDashboard([defaultButton]);
  const actions = createAdminRevenueActions({
    app: {
      querySelector(selector) {
        assert.equal(selector, '[data-revenue-dashboard]');
        return dashboard;
      }
    },
    escapeHtml: (value) => String(value).replace(/</g, '&lt;'),
    loadAdminAnalytics: async (range) => {
      assert.equal(range, '30d');
      throw new Error('bad <range>');
    },
    renderRevenueDashboard: () => ''
  });

  actions.bindRevenueDashboard();
  await defaultButton.listeners.click({ currentTarget: defaultButton });

  assert.equal(defaultButton.disabled, false);
  assert.equal(dashboard.htmlInserts[0].position, 'afterbegin');
  assert.match(dashboard.htmlInserts[0].html, /Không tải/);
  assert.match(dashboard.htmlInserts[0].html, /bad &lt;range>/);
  assert.doesNotMatch(dashboard.htmlInserts[0].html, /bad <range>/);
});

test('admin revenue actions safely no-op when the dashboard is absent', () => {
  const actions = createAdminRevenueActions({
    app: {
      querySelector() {
        return null;
      }
    },
    loadAdminAnalytics: async () => {
      throw new Error('should not run');
    }
  });

  assert.doesNotThrow(() => actions.bindRevenueDashboard());
});
