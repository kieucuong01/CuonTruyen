import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_SOURCE_EXTENSIONS = ['.jpg', '.jpeg', '.png'];
let sharpLoader = null;

export function imageOptimizationConfig(env = process.env) {
  return {
    enabled: env.IMAGE_OPTIMIZE !== 'false',
    format: String(env.IMAGE_FORMAT || 'webp').toLowerCase(),
    quality: clampNumber(env.IMAGE_QUALITY, 1, 100, 84),
    maxWidth: clampNumber(env.IMAGE_MAX_WIDTH, 320, 2400, 900),
    skipBelowBytes: Math.max(0, Number(env.IMAGE_SKIP_BELOW_KB || 180) * 1024),
    minSavingPercent: clampNumber(env.IMAGE_MIN_SAVING_PERCENT, 0, 90, 10),
    sourceExtensions: sourceExtensions(env.IMAGE_SOURCE_EXTENSIONS)
  };
}

export function coverThumbnailConfig(env = process.env) {
  return {
    enabled: env.IMAGE_COVER_THUMBNAILS !== 'false',
    format: String(env.IMAGE_THUMBNAIL_FORMAT || env.IMAGE_FORMAT || 'webp').toLowerCase(),
    quality: clampNumber(env.IMAGE_THUMBNAIL_QUALITY, 1, 100, 76),
    maxWidth: clampNumber(env.IMAGE_THUMBNAIL_WIDTH, 120, 900, 320)
  };
}

export function optimizedFilenameFor(filename, config = imageOptimizationConfig()) {
  const ext = `.${String(config.format || 'webp').replace(/^\./, '')}`;
  return `${path.basename(filename, path.extname(filename))}${ext}`;
}

export function thumbnailFilenameFor(filename = 'cover', config = coverThumbnailConfig()) {
  const ext = `.${String(config.format || 'webp').replace(/^\./, '')}`;
  const basename = path.basename(filename || 'cover', path.extname(filename || '')) || 'cover';
  return `${basename}${ext}`;
}

export function shouldAttemptImageOptimization({
  filename = '',
  byteLength = 0,
  config = imageOptimizationConfig()
} = {}) {
  const ext = path.extname(filename).toLowerCase();
  return Boolean(
    config.enabled
    && new Set(config.sourceExtensions || DEFAULT_SOURCE_EXTENSIONS).has(ext)
    && Number(byteLength || 0) >= Number(config.skipBelowBytes || 0)
  );
}

export async function findExistingStoredImage(dir, filename, config = imageOptimizationConfig()) {
  const candidates = [
    filename,
    optimizedFilenameFor(filename, config)
  ].filter(Boolean);
  for (const candidate of [...new Set(candidates)]) {
    const filePath = path.join(dir, candidate);
    try {
      await fs.access(filePath);
      return {
        filename: candidate,
        filePath,
        existed: true
      };
    } catch {}
  }
  return {
    filename,
    filePath: path.join(dir, filename),
    existed: false
  };
}

export async function writeImageWithOptimization({
  buffer,
  dir,
  filename,
  config = imageOptimizationConfig()
} = {}) {
  if (!Buffer.isBuffer(buffer)) throw new Error('Image buffer is required.');
  const originalPath = path.join(dir, filename);
  const originalBytes = buffer.length;
  const optimized = await optimizeImageBuffer(buffer, filename, config);
  const selected = chooseStoredImage({
    original: {
      buffer,
      filename,
      byteLength: originalBytes,
      width: optimized.originalWidth,
      height: optimized.originalHeight
    },
    optimized,
    config
  });
  const filePath = path.join(dir, selected.filename);
  await fs.writeFile(filePath, selected.buffer);
  return {
    filename: selected.filename,
    filePath,
    originalPath,
    originalBytes,
    storedBytes: selected.byteLength,
    optimized: selected.optimized,
    width: selected.width || null,
    height: selected.height || null,
    format: selected.format || path.extname(selected.filename).replace(/^\./, '')
  };
}

export async function writeCoverThumbnail({
  buffer,
  dir,
  filename = 'cover',
  config = coverThumbnailConfig()
} = {}) {
  if (!Buffer.isBuffer(buffer)) throw new Error('Image buffer is required.');
  const thumbnail = await createThumbnailBuffer(buffer, filename, config);
  if (!thumbnail.attempted || !thumbnail.buffer) return null;
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, thumbnail.filename);
  await fs.writeFile(filePath, thumbnail.buffer);
  return {
    filename: thumbnail.filename,
    filePath,
    sourceBytes: buffer.length,
    storedBytes: thumbnail.storedBytes,
    width: thumbnail.width || null,
    height: thumbnail.height || null,
    format: thumbnail.format
  };
}

export async function optimizeImageBuffer(buffer, filename, config = imageOptimizationConfig()) {
  const originalBytes = buffer.length;
  if (!shouldAttemptImageOptimization({ filename, byteLength: originalBytes, config })) {
    return {
      attempted: false,
      reason: 'skipped-by-config',
      originalBytes
    };
  }

  const sharp = await loadSharp();
  if (!sharp) {
    return {
      attempted: false,
      reason: 'sharp-not-installed',
      originalBytes
    };
  }

  try {
    const image = sharp(buffer, { limitInputPixels: false });
    const metadata = await image.metadata();
    const width = Number(metadata.width || 0);
    const resizeOptions = width > config.maxWidth
      ? { width: config.maxWidth, withoutEnlargement: true }
      : null;
    const pipeline = resizeOptions ? image.resize(resizeOptions) : image.clone();
    const output = await encodeOutput(pipeline, config);
    const outputMetadata = await sharp(output, { limitInputPixels: false }).metadata();
    return {
      attempted: true,
      buffer: output,
      filename: optimizedFilenameFor(filename, config),
      originalBytes,
      optimizedBytes: output.length,
      originalWidth: metadata.width || null,
      originalHeight: metadata.height || null,
      width: outputMetadata.width || metadata.width || null,
      height: outputMetadata.height || metadata.height || null,
      format: config.format
    };
  } catch (error) {
    return {
      attempted: false,
      reason: error.message || 'optimization-failed',
      originalBytes
    };
  }
}

export async function createThumbnailBuffer(buffer, filename = 'cover', config = coverThumbnailConfig()) {
  if (!config.enabled) {
    return {
      attempted: false,
      reason: 'disabled',
      sourceBytes: buffer.length
    };
  }

  const sharp = await loadSharp();
  if (!sharp) {
    return {
      attempted: false,
      reason: 'sharp-not-installed',
      sourceBytes: buffer.length
    };
  }

  try {
    const image = sharp(buffer, { limitInputPixels: false }).rotate();
    const output = await encodeOutput(
      image.resize({
        width: config.maxWidth,
        withoutEnlargement: true
      }),
      config
    );
    const metadata = await sharp(output, { limitInputPixels: false }).metadata();
    return {
      attempted: true,
      buffer: output,
      filename: thumbnailFilenameFor(filename, config),
      sourceBytes: buffer.length,
      storedBytes: output.length,
      width: metadata.width || null,
      height: metadata.height || null,
      format: config.format
    };
  } catch (error) {
    return {
      attempted: false,
      reason: error.message || 'thumbnail-failed',
      sourceBytes: buffer.length
    };
  }
}

export function estimateOptimizationSaving({
  originalBytes = 0,
  optimizedBytes = 0
} = {}) {
  if (!originalBytes || !optimizedBytes) return 0;
  return Math.max(0, (1 - (optimizedBytes / originalBytes)) * 100);
}

function chooseStoredImage({ original, optimized, config }) {
  const savingPercent = estimateOptimizationSaving({
    originalBytes: original.byteLength,
    optimizedBytes: optimized.optimizedBytes
  });
  if (
    optimized.attempted
    && optimized.buffer
    && savingPercent >= Number(config.minSavingPercent || 0)
  ) {
    return {
      buffer: optimized.buffer,
      filename: optimized.filename,
      byteLength: optimized.optimizedBytes,
      optimized: true,
      width: optimized.width,
      height: optimized.height,
      format: optimized.format
    };
  }
  return {
    buffer: original.buffer,
    filename: original.filename,
    byteLength: original.byteLength,
    optimized: false,
    width: original.width,
    height: original.height,
    format: path.extname(original.filename).replace(/^\./, '')
  };
}

async function encodeOutput(pipeline, config) {
  if (config.format === 'jpeg' || config.format === 'jpg') {
    return pipeline.jpeg({ quality: config.quality, mozjpeg: true }).toBuffer();
  }
  if (config.format === 'png') {
    return pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  }
  return pipeline.webp({ quality: config.quality }).toBuffer();
}

async function loadSharp() {
  if (!sharpLoader) {
    sharpLoader = import('sharp')
      .then((module) => module.default || module)
      .catch(() => null);
  }
  return sharpLoader;
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function sourceExtensions(value = '') {
  const selected = String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .map((item) => item.startsWith('.') ? item : `.${item}`);
  return selected.length ? [...new Set(selected)] : DEFAULT_SOURCE_EXTENSIONS;
}
