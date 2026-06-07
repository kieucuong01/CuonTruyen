export const READER_BLANK_IMAGE_SRC = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

function imageHeight(image) {
  const rect = image?.getBoundingClientRect?.();
  const measuredHeight = Number(rect?.height || 0);
  if (Number.isFinite(measuredHeight) && measuredHeight > 1) {
    return Math.round(measuredHeight);
  }

  const measuredWidth = Number(rect?.width || image?.clientWidth || 0);
  const attrWidth = Number(image?.getAttribute?.('width') || image?.width || 0);
  const attrHeight = Number(image?.getAttribute?.('height') || image?.height || 0);
  if (measuredWidth > 0 && attrWidth > 0 && attrHeight > 0) {
    return Math.round((measuredWidth * attrHeight) / attrWidth);
  }

  return 0;
}

function imageBounds(image, scrollY) {
  const rect = image?.getBoundingClientRect?.() || {};
  const top = Number(scrollY || 0) + Number(rect.top || 0);
  const height = imageHeight(image);
  return {
    top,
    bottom: top + height,
    height
  };
}

export function releaseReaderImageElement(image, blankSrc = READER_BLANK_IMAGE_SRC) {
  if (!image || !blankSrc) return false;
  const currentAttribute = image.getAttribute?.('src') || image.src || '';
  if (currentAttribute === blankSrc) return false;

  const currentSource = image.dataset?.readerSrc
    || image.dataset?.readerPageSrc
    || image.currentSrc
    || image.src
    || currentAttribute;
  if (currentSource && currentSource !== blankSrc && image.dataset) {
    image.dataset.readerSrc = currentSource;
  }

  const height = imageHeight(image);
  if (height > 0 && image.style) {
    image.style.height = `${height}px`;
  }
  if (image.dataset) image.dataset.readerReleased = 'true';
  image.src = blankSrc;
  image.loading = 'lazy';
  return true;
}

export function restoreReaderImageElement(image, source, blankSrc = READER_BLANK_IMAGE_SRC) {
  if (!image || !source || source === blankSrc) return false;
  const currentAttribute = image.getAttribute?.('src') || image.src || '';
  if (currentAttribute !== blankSrc) return false;

  const clearReleasedHeight = () => {
    const current = image.getAttribute?.('src') || image.src || '';
    if (current && current !== blankSrc && image.dataset?.readerReleased === 'true') {
      if (image.style) image.style.height = '';
      delete image.dataset.readerReleased;
    }
  };

  if (image.addEventListener) {
    image.addEventListener('load', clearReleasedHeight, { once: true });
  }
  image.src = source;
  if (image.complete) clearReleasedHeight();
  return true;
}

export function applyReaderImageWindow({
  images = [],
  scrollY = 0,
  viewportHeight = 0,
  blankSrc = READER_BLANK_IMAGE_SRC,
  releaseScreens = 4,
  restoreScreens = 2
} = {}) {
  const viewport = Math.max(1, Number(viewportHeight || 0));
  const releaseTop = Number(scrollY || 0) - viewport * releaseScreens;
  const releaseBottom = Number(scrollY || 0) + viewport * releaseScreens;
  const restoreTop = Number(scrollY || 0) - viewport * restoreScreens;
  const restoreBottom = Number(scrollY || 0) + viewport * restoreScreens;
  let released = 0;
  let restored = 0;

  for (const image of images) {
    if (!image) continue;
    const bounds = imageBounds(image, scrollY);
    const source = image.dataset?.readerSrc || image.dataset?.readerPageSrc || '';
    const currentAttribute = image.getAttribute?.('src') || image.src || '';
    const isReleased = currentAttribute === blankSrc || image.dataset?.readerReleased === 'true';
    const nearReaderWindow = bounds.bottom >= restoreTop && bounds.top <= restoreBottom;

    if (isReleased && nearReaderWindow) {
      if (restoreReaderImageElement(image, source, blankSrc)) restored += 1;
      continue;
    }

    const outsideReleaseWindow = bounds.bottom < releaseTop || bounds.top > releaseBottom;
    if (!isReleased && outsideReleaseWindow) {
      if (releaseReaderImageElement(image, blankSrc)) released += 1;
    }
  }

  return { released, restored };
}
