/**
 * @param {Storage} storage
 * @param {string} key
 * @returns {{ok: true, value: string|null}|{ok: false, error: unknown}}
 */
export function safeGetItem(storage, key) {
  try {
    return { ok: true, value: storage.getItem(key) };
  } catch (error) {
    return { ok: false, error };
  }
}

/**
 * @param {Storage} storage
 * @param {string} key
 * @param {string} value
 * @returns {{ok: true}|{ok: false, error: unknown}}
 */
export function safeSetItem(storage, key, value) {
  try {
    storage.setItem(key, value);
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

/**
 * @param {Storage} storage
 * @param {string} key
 * @returns {{ok: true}|{ok: false, error: unknown}}
 */
export function safeRemoveItem(storage, key) {
  try {
    storage.removeItem(key);
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}
