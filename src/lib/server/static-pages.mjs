import { getStaticPage, STATIC_PAGES } from '../../../server/seo.mjs';

const NOT_FOUND_PAGE = {
  title: 'Không tìm thấy trang - Cuộn Truyện',
  description: 'Trang bạn đang tìm không tồn tại hoặc nội dung đã được ẩn khỏi Cuộn Truyện.',
  heading: 'Không tìm thấy trang',
  body: 'Nội dung có thể đã bị ẩn, chưa được publish hoặc đường dẫn không còn hợp lệ.',
  items: [
    'Quay lại trang chủ để xem truyện mới cập nhật.',
    'Kiểm tra lại đường dẫn truyện hoặc chương bạn vừa mở.',
    'Nội dung draft hoặc removed không xuất hiện trên bề mặt public.'
  ],
  noIndex: true
};

export function nextStaticPageData(pathname = '') {
  const normalized = String(pathname || '').startsWith('/') ? String(pathname || '') : `/${pathname}`;
  const page = getStaticPage(normalized);
  return page ? { ...page } : null;
}

export function nextStaticPagePaths() {
  return STATIC_PAGES.map((page) => page.path);
}

export function nextNotFoundPageData() {
  return { ...NOT_FOUND_PAGE, items: [...NOT_FOUND_PAGE.items] };
}
