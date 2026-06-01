export function createBoundedCache({ maxEntries = 250 } = {}) {
  const entries = new Map();

  function touch(key, value) {
    entries.delete(key);
    entries.set(key, value);
    while (entries.size > maxEntries) {
      const oldestKey = entries.keys().next().value;
      entries.delete(oldestKey);
    }
  }

  return {
    get(key) {
      if (!entries.has(key)) return undefined;
      const value = entries.get(key);
      touch(key, value);
      return value;
    },
    set(key, value) {
      touch(key, value);
      return this;
    },
    clear() {
      entries.clear();
    },
    size() {
      return entries.size;
    },
    keys() {
      return [...entries.keys()];
    }
  };
}
