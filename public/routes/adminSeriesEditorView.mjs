import { hasReadableChapter } from '../chapterState.mjs';
import { escapeAttr, escapeHtml } from '../domUtils.mjs';
import {
  renderAdminProductionBadge,
  renderProductionPipelineStep
} from './adminProductionView.mjs';
import {
  adminSeriesStats,
  renderAdminSeriesBadges,
  renderAssetModeBadge,
  seriesUsesExternalImageUrls,
  sourceUrlForAdminSeries,
  statusLabel
} from './adminSeriesView.mjs';
import {
  getManualTagNames,
  renderOriginTagPicker
} from './adminTags.mjs';

export function renderAdminSeriesCard(series, {
  localOps = false,
  productionStatus = null,
  runtimeConfig = runtimeConfigFromWindow()
} = {}) {
  const sourceUrl = sourceUrlForAdminSeries(series);
  const stats = adminSeriesStats(series);
  return `
      <article class="admin-series-card admin-series-list-card">
        <div class="admin-series-summary">
          ${renderAdminSeriesCover(series)}
          <div class="admin-series-summary-copy">
            <strong title="${escapeAttr(series.title)}">${escapeHtml(series.title)}</strong>
            <span>${stats.importedChapterCount}/${stats.chapterCount} chapter - ${stats.pageCount} ảnh</span>
            ${renderAdminSeriesBadges(stats)}
            ${renderAssetModeBadge(series)}
            ${renderAdminProductionBadge(series, productionStatus)}
          </div>
        </div>
        <div class="admin-series-card-actions">
          <a class="primary-btn" data-link href="/admin/series/${escapeAttr(series.id)}">Quản lý</a>
          ${localOps ? `<button class="ghost-btn" type="button" data-update-chapters="${escapeAttr(series.id)}" ${sourceUrl ? '' : 'disabled'}>Cập nhật chapter mới</button>` : ''}
          ${localOps && seriesUsesExternalImageUrls(series) ? `<button class="ghost-btn" type="button" data-refresh-image-urls="${escapeAttr(series.id)}" ${sourceUrl ? '' : 'disabled'}>Refresh URL ảnh</button>` : ''}
          ${localOps ? `<button class="ghost-btn production-quick-btn" type="button" data-publish-production="${escapeAttr(series.id)}" ${productionStatus?.storage?.productionPostgres?.configured ? '' : 'disabled'}>Đưa lên production</button>` : ''}
          ${series.slug ? `<button class="ghost-btn" type="button" data-production-check="${escapeAttr(series.id)}" data-production-url="${escapeAttr(resolveProductionSeriesUrl(series, runtimeConfig))}">Check</button>` : ''}
          ${series.slug ? `<a class="ghost-btn" data-link href="/truyen/${escapeAttr(series.slug)}">Mở public</a>` : ''}
        </div>
        ${localOps ? `<div class="status-line admin-update-status" data-update-chapters-status="${escapeAttr(series.id)}"></div>` : ''}
        <div class="status-line production-publish-status" data-production-publish-status="${escapeAttr(series.id)}"></div>
      </article>
    `;
}

export function renderAdminSeriesEditor(series, {
  chapterHrefSegment = (chapter) => chapter.slug || chapter.id,
  localOps = false,
  productionStatus = null,
  runtimeConfig = runtimeConfigFromWindow()
} = {}) {
  const schedule = series.crawlSchedule || {};
  const sourceUrl = sourceUrlForAdminSeries(series);
  const chapters = Array.isArray(series.chapters) ? series.chapters : [];
  const stats = adminSeriesStats(series);
  return `
      <form class="admin-series-editor" data-admin-series="${escapeAttr(series.id)}">
        <section class="admin-detail-hero">
          ${renderAdminSeriesCover(series, { large: true })}
          <div class="admin-detail-title">
            <p class="eyebrow">Quản lý truyện</p>
            <h2>${escapeHtml(series.title)}</h2>
            <p>${stats.importedChapterCount}/${stats.chapterCount} chapter - ${stats.pageCount} ảnh - ${escapeHtml(statusLabel(stats.status))}</p>
            ${renderAdminSeriesBadges(stats)}
            ${renderAssetModeBadge(series)}
            ${renderAdminProductionBadge(series, productionStatus)}
          </div>
          ${localOps ? `<div class="admin-detail-actions">
            <button class="ghost-btn" type="button" data-update-chapters="${escapeAttr(series.id)}" ${sourceUrl ? '' : 'disabled'}>Cập nhật chapter mới</button>
            ${seriesUsesExternalImageUrls(series) ? `<button class="ghost-btn" type="button" data-refresh-image-urls="${escapeAttr(series.id)}" ${sourceUrl ? '' : 'disabled'}>Refresh URL ảnh</button>` : ''}
            <span class="muted">${sourceUrl ? 'Chỉ tải chapter chưa có, không tải lại ảnh cũ.' : 'Chưa có source URL để cập nhật.'}</span>
          </div>` : `<div class="admin-detail-actions"><span class="muted">Production admin chỉ quản lý nội dung; crawl và sync chạy ở local.</span></div>`}
        </section>
        ${localOps ? `<div class="status-line admin-wide admin-update-status" data-update-chapters-status="${escapeAttr(series.id)}"></div>` : ''}
        ${localOps ? renderProductionPublishPanel(series, { productionStatus, runtimeConfig }) : ''}
        <section class="admin-editor-section">
          <div class="section-head admin-editor-section-head">
            <div>
              <h2>Metadata</h2>
              <p>Cập nhật thông tin hiển thị public và SEO.</p>
            </div>
          </div>
          <div class="admin-series-details-grid">
            <label>Tiêu đề<input name="title" value="${escapeAttr(series.title)}" /></label>
            <label>Slug<input name="slug" value="${escapeAttr(series.slug || '')}" /></label>
            <label>Trạng thái${renderStatusSelect('status', stats.status)}</label>
            <label>Cover URL<input name="coverUrl" value="${escapeAttr(series.coverUrl || '')}" /></label>
            <label>Aliases<input name="aliases" value="${escapeAttr((series.aliases || []).join(', '))}" placeholder="Tên khác, cách nhau bởi dấu phẩy" /></label>
            <label>Tags<input name="tags" value="${escapeAttr(getManualTagNames(series).join(', '))}" placeholder="Action, Fantasy, School Life" /></label>
            ${renderOriginTagPicker(series)}
            <label class="admin-wide">Mô tả SEO<textarea name="description" aria-label="Mô tả" placeholder="Mô tả SEO">${escapeHtml(series.description || '')}</textarea></label>
            ${localOps ? `<label class="toggle-row"><input name="scheduleEnabled" type="checkbox" ${schedule.enabled ? 'checked' : ''} /> Auto crawl</label>` : ''}
            ${localOps ? `<label>Interval giờ<input name="intervalHours" type="number" min="1" value="${Number(schedule.intervalHours || 24)}" /></label>` : ''}
          </div>
        </section>
        <section class="admin-editor-section">
          <div class="admin-chapter-review admin-wide">
            <div class="admin-chapter-review-head">
              <strong>Duyệt chapter</strong>
              <span>Ẩn chapter lỗi hoặc chưa muốn public. Không xóa ảnh cache.</span>
            </div>
            ${chapters.length ? chapters.map((chapter) => renderAdminChapterRow(series, chapter, { chapterHrefSegment })).join('') : '<p class="muted">Chưa có chapter.</p>'}
          </div>
        </section>
        <div class="admin-editor-savebar">
          <button class="primary-btn" type="submit">Lưu thay đổi</button>
        </div>
      </form>
    `;
}

export function renderProductionPublishPanel(series, {
  productionStatus = null,
  runtimeConfig = runtimeConfigFromWindow()
} = {}) {
  const productionUrl = resolveProductionSeriesUrl(series, runtimeConfig);
  const sourceUrl = sourceUrlForAdminSeries(series);
  const urlOnlyAssets = seriesUsesExternalImageUrls(series);
  const productionDbConfigured = Boolean(productionStatus?.storage?.productionPostgres?.configured);
  const productionDbWarning = productionDbConfigured ? '' : `
      <div class="status-line admin-wide production-publish-status error">
        Missing PRODUCTION_CATALOG_DATABASE_URL. Set production DB target to enable full publish and Sync DB.
      </div>
    `;
  const steps = [
    ...(urlOnlyAssets ? [{
      key: 'refresh-image-urls',
      label: 'Refresh URL ảnh',
      description: sourceUrl
        ? 'Crawl lại URL ảnh cho chapter hiện có, thêm chapter mới nếu nguồn có. Xong bước này cần Sync DB production.'
        : 'Cần source URL trước khi refresh URL ảnh.',
      button: 'Refresh URL ảnh',
      disabled: !sourceUrl,
      buttonAttr: `data-refresh-image-urls="${escapeAttr(series.id)}"`
    }] : []),
    {
      key: 'update-chapters',
      label: '1. Crawl chapter mới',
      description: sourceUrl ? 'Chỉ tải chapter chưa có, không tải lại ảnh cũ.' : 'Cần source URL trước khi cập nhật chapter.',
      button: 'Cập nhật chapter mới',
      disabled: !sourceUrl,
      buttonAttr: `data-update-chapters="${escapeAttr(series.id)}"`
    },
    {
      key: 'optimize',
      label: '2. Optimize ảnh',
      description: 'Tối ưu nhanh ảnh mới/chưa tối ưu. Không cleanup sâu mặc định.',
      button: 'Chạy optimize',
      steps: ['optimize']
    },
    {
      key: 'sync-images',
      label: '3. Sync ảnh S3',
      description: 'Chỉ sync ảnh của truyện đang chọn, có retry và resume checkpoint.',
      button: 'Sync S3',
      steps: ['sync-images']
    },
    {
      key: 'sync-catalog-db',
      label: '4. Sync catalog DB',
      description: 'Cap nhat metadata/chapter/page cua rieng truyen nay len production DB sau khi anh da len S3.',
      button: 'Sync DB',
      steps: ['sync-catalog-db'],
      disabled: !productionDbConfigured
    },
    {
      key: 'production-check',
      label: '5. Kiểm tra production',
      description: 'Mở/check URL production của truyện sau khi sync xong.',
      button: 'Check production',
      check: true,
      disabled: !productionUrl
    }
  ];
  return `
      <section class="admin-editor-section production-publish-panel">
        <div class="section-head admin-editor-section-head">
          <div>
            <p class="eyebrow">Production pipeline</p>
            <h2>Tối ưu ảnh và đưa truyện lên production</h2>
            <p>Chạy từng bước để dễ theo dõi và retry riêng khi kẹt. Nếu S3 lỗi thì chỉ bấm lại bước Sync S3, không cần chạy lại toàn bộ.</p>
          </div>
          <button class="primary-btn" type="button" data-publish-production="${escapeAttr(series.id)}" ${productionDbConfigured ? '' : 'disabled'}>Chạy nhanh: optimize + sync ảnh + sync DB</button>
        </div>
        ${productionDbWarning}
        <div class="production-pipeline-list" aria-label="Production pipeline steps">
          ${steps.map((step) => renderProductionPipelineStep(series, step, productionUrl)).join('')}
        </div>
        <div class="production-publish-note">
          <span>Khuyến nghị: crawl mới -> optimize -> sync ảnh S3 -> sync catalog DB -> check production.</span>
          ${productionUrl ? `<a href="${escapeAttr(productionUrl)}" target="_blank" rel="noopener noreferrer">Mở production</a>` : '<span>Truyện chưa có slug public để mở production.</span>'}
        </div>
        <div class="status-line admin-wide production-publish-status" data-production-publish-status="${escapeAttr(series.id)}"></div>
      </section>
    `;
}

export function resolveProductionSeriesUrl(series = {}, runtimeConfig = runtimeConfigFromWindow()) {
  if (!series?.slug) return '';
  const configuredBase = runtimeConfig?.productionBaseUrl || runtimeConfig?.publicSiteUrl || '';
  const base = String(configuredBase || 'https://cuontruyen.vercel.app').replace(/\/+$/, '');
  return `${base}/truyen/${encodeURIComponent(series.slug)}`;
}

export function renderAdminSeriesCover(series, { large = false } = {}) {
  const coverUrl = series.thumbnailUrl || series.coverThumbnailUrl || series.coverUrl || series.imageUrl || '';
  const fallbackUrl = firstReadablePageImage(series);
  const initial = String(series.title || 'Truyện').trim().slice(0, 2).toUpperCase();
  return `
      <span class="admin-series-cover ${large ? 'is-large' : ''}" aria-hidden="true">
        <span class="admin-series-cover-fallback">${escapeHtml(initial || 'TR')}</span>
        ${coverUrl || fallbackUrl
          ? `<img data-admin-cover-img src="${escapeAttr(coverUrl || fallbackUrl)}" ${coverUrl && fallbackUrl && fallbackUrl !== coverUrl ? `data-fallback-src="${escapeAttr(fallbackUrl)}"` : ''} alt="" loading="lazy" />`
          : ''}
      </span>
    `;
}

export function firstReadablePageImage(series = {}) {
  for (const chapter of series.chapters || []) {
    if (!hasReadableChapter(chapter)) continue;
    const page = (chapter.pages || []).find((item) => item?.imageUrl || item?.src || item?.storageKey);
    const src = page?.imageUrl || page?.src || page?.storageKey || '';
    if (src) return src;
  }
  return '';
}

export function renderStatusSelect(name, value) {
  const options = [
    ['public', 'Public'],
    ['draft', 'Draft'],
    ['removed', 'Removed']
  ];
  return `<select name="${escapeAttr(name)}">${options.map(([key, label]) => `<option value="${key}" ${value === key ? 'selected' : ''}>${label}</option>`).join('')}</select>`;
}

export function renderAdminChapterRow(series, chapter, {
  chapterHrefSegment = (item) => item.slug || item.id
} = {}) {
  const readable = hasReadableChapter(chapter);
  const status = chapter.status || (readable ? 'public' : 'draft');
  const flags = [
    readable ? '' : 'thiếu ảnh',
    status === 'removed' ? 'đã ẩn' : '',
    status === 'draft' ? 'draft' : ''
  ].filter(Boolean);
  return `
      <div class="admin-chapter-row" data-admin-chapter="${escapeAttr(chapter.id)}">
        <div>
          <input name="chapterTitle:${escapeAttr(chapter.id)}" value="${escapeAttr(chapter.title || chapter.label || '')}" aria-label="Tên chapter" />
          <span>${chapter.pageCount || 0} ảnh${flags.length ? ` - ${escapeHtml(flags.join(' - '))}` : ''}</span>
        </div>
        ${renderStatusSelect(`chapterStatus:${chapter.id}`, status)}
        <input name="chapterReason:${escapeAttr(chapter.id)}" value="${escapeAttr(chapter.takedownReason || '')}" placeholder="Lý do ẩn" />
        <a class="ghost-btn" data-link href="/truyen/${escapeAttr(series.slug)}/${escapeAttr(chapterHrefSegment(chapter))}">Mở</a>
      </div>
    `;
}

function runtimeConfigFromWindow() {
  return globalThis.window?.COMIC_READER_CONFIG || {};
}
