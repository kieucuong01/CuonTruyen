import { escapeAttr, escapeHtml } from './domUtils.mjs';

export function renderBrandLogoView({
  brandName = 'Cuộn Truyện',
  brandTagline = 'Đọc liền mạch, lưu đúng chương',
  brandLogo = '/favicon.svg?v=3',
  compact = false
} = {}) {
  return `
    <span class="brand-logo ${compact ? 'compact' : ''}" aria-label="${escapeAttr(brandName)}">
      <img src="${escapeAttr(brandLogo)}" alt="${escapeAttr(brandName)}" width="${compact ? 152 : 214}" height="${compact ? 46 : 64}" />
      <span class="brand-logo-fallback">
        <strong>${escapeHtml(brandName)}</strong>
        ${compact ? '' : `<small>${escapeHtml(brandTagline)}</small>`}
      </span>
    </span>
  `;
}

export function topbarNavItems({ pathname = '/', hash = '' } = {}) {
  return [
    { href: '/', label: 'Trang chủ', active: pathname === '/' && !hash },
    { href: '#/following', label: 'Theo dõi', active: hash === '#/following' },
    { href: '#/history', label: 'Lịch sử', active: hash === '#/history' },
    { href: '#/search', label: 'Tìm kiếm', active: hash === '#/search' },
    { href: '#/genres', label: 'Thể loại', active: hash === '#/genres' || pathname.startsWith('/the-loai/') }
  ];
}

export function renderTopbarView({
  brandName,
  brandTagline,
  brandLogo,
  pathname = '/',
  hash = '',
  user = null
} = {}) {
  const navItems = topbarNavItems({ pathname, hash });
  return `
    <header class="topbar">
      <a class="brand" data-link href="/">
        ${renderBrandLogoView({ brandName, brandTagline, brandLogo })}
      </a>
      <nav class="main-nav" aria-label="Điều hướng chính">
        ${navItems.map((item) => `
          <a data-link href="${escapeAttr(item.href)}" ${item.active ? 'aria-current="page" class="active"' : ''}>${escapeHtml(item.label)}</a>
        `).join('')}
      </nav>
      <div class="top-actions ${user ? 'is-authenticated' : ''}">
        ${user ? `
          <span class="user-chip">${escapeHtml(user.displayName || 'Reader')}</span>
          <button class="login-btn muted-btn logout-btn" type="button" data-user-logout>Đăng xuất</button>
        ` : '<a class="login-btn" data-link href="#/login">Đăng nhập</a>'}
      </div>
    </header>
  `;
}

export function renderUserAuthPage({
  topbarHtml = '',
  user = null,
  isRegister = false,
  googleStartUrl = '/api/auth/google/start'
} = {}) {
  return `
    <main class="site-shell">
      ${topbarHtml}
      <section class="auth-card">
        <form class="auth-panel" data-user-login-form>
          <h2>${isRegister ? 'Tạo tài khoản đọc' : (user ? 'Đổi tài khoản đọc' : 'Đăng nhập')}</h2>
          <p>Tài khoản cần mật khẩu để giữ danh sách theo dõi an toàn hơn khi đổi thiết bị.</p>
          <a class="google-login-btn" href="${escapeAttr(googleStartUrl)}">
            <span aria-hidden="true">G</span>
            Đăng nhập bằng Google
          </a>
          <div class="auth-divider"><span>hoặc</span></div>
          <input name="identifier" required placeholder="Tên hoặc email" value="${escapeAttr(user?.identifier || '')}" autocomplete="username" />
          ${isRegister ? '<input name="displayName" placeholder="Tên hiển thị" autocomplete="name" />' : ''}
          <input name="password" type="password" required minlength="6" placeholder="Mật khẩu" autocomplete="${isRegister ? 'new-password' : 'current-password'}" />
          <button class="primary-btn" type="submit">${isRegister ? 'Đăng ký' : 'Đăng nhập'}</button>
          <p class="muted">${isRegister
            ? 'Đã có tài khoản? <a data-link href="#/login">Đăng nhập</a>'
            : 'Chưa có tài khoản? <a data-link href="#/register">Đăng ký</a>'}</p>
          <span class="status-line" data-status></span>
        </form>
      </section>
    </main>
  `;
}
