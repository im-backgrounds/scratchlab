import { compileScoreData } from "./score-compiler.js";

export const STORAGE_KEY = "scratchlab.storage";
export const STORAGE_VERSION = 1;
export const MAX_SAVED_CHARTS = 100;
export const MAX_NAME_LENGTH = 80;
export const DEFAULT_CHART_NAME = "無題の譜面";
const VIEWS = ["practice", "guide", "builder", "achievements"];

/**
 * Upgrade functions keyed by the version they read. Each returns the next
 * version's shape, so stored data can be migrated one step at a time.
 */
export const MIGRATIONS = {
  // Version 0 is any object without a `version` field.
  0: (data) => ({
    version: 1,
    charts: Array.isArray(data.charts) ? data.charts : [],
    session: data.session ?? null,
  }),
};

/** @returns {{version: number, charts: object[], session: object|null}} */
export function createEmptyStore() {
  return { version: STORAGE_VERSION, charts: [], session: null };
}

/**
 * Trims a chart name and limits it to the supported length.
 * @param {unknown} value Candidate name.
 * @returns {string} Normalized name, or an empty string when unusable.
 */
export function normalizeChartName(value) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, MAX_NAME_LENGTH);
}

/**
 * Validates a shareable chart document by compiling it and returns a detached
 * JSON copy so later edits to the source cannot mutate stored data.
 * @param {unknown} chart Chart document `{ name, difficulty, beat, score }`.
 * @returns {object} Cloned chart document.
 */
export function cloneValidChart(chart) {
  if (!chart || typeof chart !== "object" || Array.isArray(chart)) {
    throw new Error("譜面データが不正です。");
  }
  const copy = JSON.parse(JSON.stringify(chart));
  compileScoreData(copy);
  return copy;
}

function isChartShape(chart) {
  return Boolean(chart) && typeof chart === "object" &&
    !Array.isArray(chart) && Array.isArray(chart.score);
}

// Reads only check structure so each autosave stays cheap; charts are fully
// compiled when they are written or loaded into the builder.
function normalizeEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  if (typeof entry.id !== "string" || !entry.id) return null;
  if (!isChartShape(entry.chart)) return null;
  const createdAt = Number.isFinite(entry.createdAt) ? entry.createdAt : 0;
  const updatedAt = Number.isFinite(entry.updatedAt)
    ? entry.updatedAt
    : createdAt;
  return { id: entry.id, createdAt, updatedAt, chart: entry.chart };
}

function normalizeSession(session) {
  if (!session || typeof session !== "object") return null;
  const draft = session.draft && isChartShape(session.draft.chart)
    ? {
      chart: session.draft.chart,
      savedChartId: typeof session.draft.savedChartId === "string"
        ? session.draft.savedChartId
        : null,
    }
    : null;
  return {
    view: VIEWS.includes(session.view) ? session.view : "practice",
    selectedChartId: typeof session.selectedChartId === "string"
      ? session.selectedChartId
      : null,
    draft,
  };
}

function normalizeStore(data) {
  const seen = new Set();
  const charts = data.charts.map(normalizeEntry).filter((entry) => {
    if (!entry || seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  }).slice(0, MAX_SAVED_CHARTS);
  return {
    version: STORAGE_VERSION,
    charts,
    session: normalizeSession(data.session),
  };
}

/**
 * Parses stored text into the current store shape. Never throws.
 * @param {string|null} text Raw localStorage value.
 * @param {Record<number, Function>} [migrations] Migration table.
 * @returns {{store: object, status: "ok"|"empty"|"corrupt"|"future"}}
 *   `future` means the data was written by a newer app version and must not
 *   be overwritten.
 */
export function parseStore(text, migrations = MIGRATIONS) {
  if (text === null || text === undefined || text === "") {
    return { store: createEmptyStore(), status: "empty" };
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { store: createEmptyStore(), status: "corrupt" };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { store: createEmptyStore(), status: "corrupt" };
  }
  let version = Number.isInteger(data.version) ? data.version : 0;
  if (version > STORAGE_VERSION || version < 0) {
    return { store: createEmptyStore(), status: "future" };
  }
  while (version < STORAGE_VERSION) {
    const migrate = migrations[version];
    if (!migrate) return { store: createEmptyStore(), status: "corrupt" };
    data = migrate(data);
    version = data.version;
  }
  return { store: normalizeStore(data), status: "ok" };
}

function defaultCreateId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `c${Date.now().toString(36)}${
    Math.random().toString(36).slice(2, 10)
  }`;
}

/**
 * Creates a LocalStorage-backed repository for saved charts and the last
 * session. Every mutation re-reads storage first so multiple tabs cannot
 * overwrite each other with stale snapshots.
 * @param {Storage|null} storage Storage-like object, or null if unavailable.
 * @param {{key?: string, now?: () => number, createId?: () => string}} [options]
 */
export function createChartRepository(storage, options = {}) {
  const key = options.key ?? STORAGE_KEY;
  const now = options.now ?? Date.now;
  const createId = options.createId ?? defaultCreateId;
  const available = Boolean(storage);

  const read = () => {
    if (!available) return { store: createEmptyStore(), status: "empty" };
    let raw = null;
    try {
      raw = storage.getItem(key);
    } catch {
      return { store: createEmptyStore(), status: "corrupt", raw };
    }
    return { ...parseStore(raw), raw };
  };

  const mutate = (apply) => {
    if (!available) return { ok: false, reason: "unavailable" };
    const { store, status, raw } = read();
    if (status === "future") return { ok: false, reason: "future-version" };
    const outcome = apply(store);
    if (!outcome.ok) return outcome;
    try {
      // Preserve unreadable data once before it is replaced.
      if (status === "corrupt" && raw) storage.setItem(`${key}.backup`, raw);
      storage.setItem(key, JSON.stringify(store));
    } catch {
      return { ok: false, reason: "write-failed" };
    }
    return outcome;
  };

  return {
    available,

    /** @returns {{charts: object[], session: object|null, status: string}} */
    load() {
      const { store, status } = read();
      return { charts: store.charts, session: store.session, status };
    },

    /** @returns {object[]} Saved charts, most recently updated first. */
    list() {
      return [...read().store.charts].sort((a, b) => b.updatedAt - a.updatedAt);
    },

    get(id) {
      return read().store.charts.find((entry) => entry.id === id) ?? null;
    },

    /**
     * Creates a saved chart, or updates the chart with `id` when given.
     * @param {{id?: string, chart: object}} input
     * @returns {{ok: true, entry: object}|{ok: false, reason: string}}
     */
    save({ id, chart }) {
      let valid;
      try {
        valid = cloneValidChart(chart);
      } catch (error) {
        return { ok: false, reason: "invalid-chart", message: error.message };
      }
      valid.name = normalizeChartName(valid.name) || DEFAULT_CHART_NAME;
      return mutate((store) => {
        const timestamp = now();
        if (id) {
          const entry = store.charts.find((item) => item.id === id);
          if (!entry) return { ok: false, reason: "not-found" };
          entry.chart = valid;
          entry.updatedAt = timestamp;
          return { ok: true, entry };
        }
        if (store.charts.length >= MAX_SAVED_CHARTS) {
          return { ok: false, reason: "limit-reached" };
        }
        const entry = {
          id: createId(),
          createdAt: timestamp,
          updatedAt: timestamp,
          chart: valid,
        };
        store.charts.push(entry);
        return { ok: true, entry };
      });
    },

    rename(id, name) {
      const nextName = normalizeChartName(name);
      if (!nextName) return { ok: false, reason: "invalid-name" };
      return mutate((store) => {
        const entry = store.charts.find((item) => item.id === id);
        if (!entry) return { ok: false, reason: "not-found" };
        entry.chart = { ...entry.chart, name: nextName };
        entry.updatedAt = now();
        return { ok: true, entry };
      });
    },

    remove(id) {
      return mutate((store) => {
        const index = store.charts.findIndex((item) => item.id === id);
        if (index < 0) return { ok: false, reason: "not-found" };
        store.charts.splice(index, 1);
        // Keep the draft's link from pointing at a chart that no longer exists.
        if (store.session?.draft?.savedChartId === id) {
          store.session.draft.savedChartId = null;
        }
        return { ok: true };
      });
    },

    getSession() {
      return read().store.session;
    },

    /**
     * Replaces the stored session after validating its draft chart.
     * @param {{view?: string, selectedChartId?: string|null, draft?: object|null}} session
     */
    saveSession(session) {
      const normalized = normalizeSession(session);
      return mutate((store) => {
        store.session = normalized;
        return { ok: true };
      });
    },

    clearSession() {
      return mutate((store) => {
        store.session = null;
        return { ok: true };
      });
    },
  };
}

/**
 * Returns window.localStorage when it is usable, otherwise null. Access can
 * throw when storage is blocked by browser privacy settings.
 * @param {typeof globalThis} [scope]
 * @returns {Storage|null}
 */
export function getBrowserStorage(scope = globalThis) {
  try {
    const storage = scope.localStorage;
    if (!storage) return null;
    const probe = `${STORAGE_KEY}.probe`;
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}
