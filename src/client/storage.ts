export function readLocalStorageJson<T>(
  key: string,
  legacyKeys: readonly string[],
  fallback: T,
): T {
  try {
    let raw = localStorage.getItem(key);
    if (!raw) {
      for (const legacyKey of legacyKeys) {
        raw = localStorage.getItem(legacyKey);
        if (raw) break;
      }
    }
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
