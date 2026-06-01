import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveSavedScrollTop, shouldRestoreProgress } from '../public/readerRestore.mjs';

test('resolveSavedScrollTop prefers chapter offset over stale absolute scroll', () => {
  const top = resolveSavedScrollTop(
    { chapterId: 'chapter-2', chapterScrollY: 320, scrollY: 9999 },
    {
      scrollY: 1000,
      findChapterNode: () => ({ getBoundingClientRect: () => ({ top: 500 }) })
    }
  );
  assert.equal(top, 1820);
});

test('shouldRestoreProgress detects saved scroll variants', () => {
  assert.equal(shouldRestoreProgress({ chapterScrollY: 1 }), true);
  assert.equal(shouldRestoreProgress({ scrollY: 1 }), true);
  assert.equal(shouldRestoreProgress({}), false);
});
