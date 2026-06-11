import test from 'node:test';
import assert from 'node:assert/strict';

import {
  renderBrandLogoView,
  renderTopbarView,
  renderUserAuthPage
} from '../public/siteChromeView.mjs';

const brand = {
  brandName: 'Cuộn <Truyện>',
  brandTagline: 'Đọc & lưu',
  brandLogo: '/favicon.svg?v=3&unsafe=<x>'
};

test('topbar view renders escaped navigation and anonymous login action', () => {
  const html = renderTopbarView({
    ...brand,
    pathname: '/',
    hash: '',
    user: null
  });

  assert.match(html, /class="topbar"/);
  assert.match(html, /aria-current="page" class="active">Trang chủ/);
  assert.match(html, /href="#\/login">Đăng nhập/);
  assert.match(html, /Cuộn &lt;Truyện&gt;/);
  assert.match(html, /src="\/favicon\.svg\?v=3&amp;unsafe=&lt;x&gt;"/);
  assert.doesNotMatch(html, /data-user-logout/);
});

test('topbar view marks authenticated state and active section from pathname/hash', () => {
  const html = renderTopbarView({
    ...brand,
    pathname: '/the-loai/manhwa',
    hash: '#/genres',
    user: { displayName: '<Reader>' }
  });

  assert.match(html, /top-actions is-authenticated/);
  assert.match(html, /&lt;Reader&gt;/);
  assert.match(html, /data-user-logout/);
  assert.match(html, /href="#\/genres" aria-current="page" class="active">Thể loại/);
});

test('brand logo view supports compact reader chrome without tagline', () => {
  const html = renderBrandLogoView({ ...brand, compact: true });

  assert.match(html, /brand-logo compact/);
  assert.match(html, /width="152" height="46"/);
  assert.doesNotMatch(html, /<small>/);
});

test('user auth page renders register and login variants from pure inputs', () => {
  const registerHtml = renderUserAuthPage({
    topbarHtml: '<nav>top</nav>',
    user: { identifier: 'name<id>' },
    isRegister: true,
    googleStartUrl: '/api/auth/google/start?next=<home>'
  });
  const loginHtml = renderUserAuthPage({
    topbarHtml: '<nav>top</nav>',
    user: null,
    isRegister: false,
    googleStartUrl: '/api/auth/google/start'
  });

  assert.match(registerHtml, /data-user-login-form/);
  assert.match(registerHtml, /name="displayName"/);
  assert.match(registerHtml, /autocomplete="new-password"/);
  assert.match(registerHtml, /value="name&lt;id&gt;"/);
  assert.match(registerHtml, /href="\/api\/auth\/google\/start\?next=&lt;home&gt;"/);
  assert.doesNotMatch(loginHtml, /name="displayName"/);
  assert.match(loginHtml, /autocomplete="current-password"/);
});
