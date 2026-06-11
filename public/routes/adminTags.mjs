import { escapeAttr, escapeHtml } from '../domUtils.mjs';

export function renderOriginTagPicker(series = {}) {
  const currentOrigin = detectOriginType(getSeriesTagNames(series));
  return `
      <div class="admin-origin-picker admin-wide">
        <div>
          <strong>Phân loại quốc gia</strong>
          <span>Quản lý tag hiển thị ở trang chủ: Truyện Hàn / Truyện Trung.</span>
        </div>
        <div class="admin-origin-options">
          ${getOriginTagOptions().map((option) => `
            <label class="admin-origin-option ${currentOrigin === option.value ? 'active' : ''}">
              <input type="radio" name="originType" value="${escapeAttr(option.value)}" ${currentOrigin === option.value ? 'checked' : ''} />
              <span>
                <strong>${escapeHtml(option.label)}</strong>
                <small>${escapeHtml(option.hint)}</small>
              </span>
            </label>
          `).join('')}
        </div>
      </div>
    `;
}

export function getOriginTagOptions() {
  return [
    { value: '', label: 'Chưa rõ', hint: 'Không gắn tag quốc gia', tags: [] },
    { value: 'manhwa', label: 'Truyện Hàn', hint: 'Gắn Manhwa + Truyện Hàn', tags: ['Manhwa', 'Truyện Hàn'] },
    { value: 'manhua', label: 'Truyện Trung', hint: 'Gắn Manhua + Truyện Trung', tags: ['Manhua', 'Truyện Trung'] }
  ];
}

export function getSeriesTagNames(series = {}) {
  return (series.tags || [])
    .map((tag) => String(typeof tag === 'string' ? tag : tag?.name || tag?.slug || '').trim())
    .filter(Boolean);
}

export function getManualTagNames(series = {}) {
  return getSeriesTagNames(series).filter((tag) => !isOriginTagName(tag));
}

export function mergeTagsWithOrigin(tags = [], originType = '') {
  const option = getOriginTagOptions().find((item) => item.value === originType) || getOriginTagOptions()[0];
  return uniqueTagNames([
    ...(tags || []).filter((tag) => !isOriginTagName(tag)),
    ...option.tags
  ]);
}

export function uniqueTagNames(tags = []) {
  const seen = new Set();
  const unique = [];
  for (const tag of tags) {
    const name = String(tag || '').trim();
    const key = normalizeAdminTagName(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    unique.push(name);
  }
  return unique;
}

export function detectOriginType(tags = []) {
  const normalized = new Set(tags.map((tag) => normalizeAdminTagName(tag)));
  if (normalized.has('manhua') || normalized.has('truyen-trung')) return 'manhua';
  if (normalized.has('manhwa') || normalized.has('truyen-han')) return 'manhwa';
  return '';
}

export function isOriginTagName(tag = '') {
  return ['manhwa', 'manhua', 'truyen-han', 'truyen-trung'].includes(normalizeAdminTagName(tag));
}

export function normalizeAdminTagName(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
