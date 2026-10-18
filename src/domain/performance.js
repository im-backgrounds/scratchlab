import { getBrowserStorage } from "./chart-storage.js";
import { safeGetItem, safeRemoveItem, safeSetItem } from "./storage-utils.js";

export const PERFORMANCE_FORMAT = "scratchlab-performance";
export const PERFORMANCE_VERSION = 1;
export const PERFORMANCE_STORAGE_KEY = "scratchlab.performance";
export const MAX_PERFORMANCE_EVENTS = 5000;

const SCRATCH_DIRECTIONS = ["forward", "backward", "stop"];
const FADER_STATES = ["open", "closed"];

export const COUNT_KEYS = [
  "forward",
  "backward",
  "stop",
  "faderOpen",
  "faderClosed",
];

export const COUNT_LABELS = {
  forward: "Forward",
  backward: "Backward",
  stop: "Stop",
  faderOpen: "Fader Open",
  faderClosed: "Fader Close",
};

/** @returns {Record<string, number>} A zeroed counts object. */
export function createEmptyCounts() {
  return Object.fromEntries(COUNT_KEYS.map((key) => [key, 0]));
}

function countKey(event) {
  if (event.type === "scratch") return event.direction;
  return event.state === "open" ? "faderOpen" : "faderClosed";
}

function isValidEvent(event) {
  if (!event || typeof event !== "object") return false;
  if (!Number.isFinite(event.t) || event.t < 0) return false;
  if (event.type === "scratch") {
    return SCRATCH_DIRECTIONS.includes(event.direction);
  }
  return event.type === "fader" && FADER_STATES.includes(event.state);
}

/**
 * Counts events by kind.
 * @param {object[]} events Performance events.
 * @returns {Record<string, number>} Counts keyed by {@link COUNT_KEYS}.
 */
export function countPerformanceEvents(events) {
  const counts = createEmptyCounts();
  for (const event of events) {
    if (isValidEvent(event)) counts[countKey(event)] += 1;
  }
  return counts;
}

function copyEvent(event) {
  return event.type === "scratch"
    ? { t: event.t, type: "scratch", direction: event.direction }
    : { t: event.t, type: "fader", state: event.state };
}

/**
 * Builds a finished performance from the raw timestamped MIDI actions.
 * Event times become offsets from the start so recordings are comparable.
 * Events are kept in time order and capped at {@link MAX_PERFORMANCE_EVENTS}.
 * @param {object[]} actionEvents `{type, direction|state, time}` in ms.
 * @param {{startedAt: number, endedAt: number, loopEnds?: number[]}} range
 *   Recording range in ms. `loopEnds` are offsets from the start where one
 *   recorded loop ends and the next begins.
 * @returns {object} A performance document.
 */
export function createPerformance(
  actionEvents,
  { startedAt, endedAt, loopEnds = [] },
) {
  const events = [];
  for (const raw of actionEvents) {
    if (!raw || typeof raw !== "object") continue;
    const event = copyEvent({ ...raw, t: Math.max(0, raw.time - startedAt) });
    if (isValidEvent(event)) events.push(event);
  }
  events.sort((a, b) => a.t - b.t);
  const truncated = events.length > MAX_PERFORMANCE_EVENTS;
  const kept = truncated ? events.slice(0, MAX_PERFORMANCE_EVENTS) : events;
  const lastT = kept.length ? kept[kept.length - 1].t : 0;
  return {
    format: PERFORMANCE_FORMAT,
    version: PERFORMANCE_VERSION,
    startedAt: new Date(startedAt).toISOString(),
    durationMs: Math.max(0, Math.round(endedAt - startedAt), lastT),
    counts: countPerformanceEvents(kept),
    truncated,
    ...toLoopEndsField(loopEnds),
    events: kept,
  };
}

// Optional field: only recordings made of several loops carry it.
function toLoopEndsField(value) {
  if (!Array.isArray(value)) return {};
  const ends = [
    ...new Set(value.filter((end) => Number.isFinite(end) && end >= 0)),
  ]
    .sort((a, b) => a - b);
  return ends.length ? { loopEnds: ends } : {};
}

/**
 * Validates a stored or imported performance and returns a normalized copy.
 * Counts are recomputed from the events, so they can never disagree.
 * @param {unknown} value Candidate document.
 * @returns {object|null} The performance, or null when it is unusable.
 */
export function normalizePerformance(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.format !== PERFORMANCE_FORMAT) return null;
  if (!Array.isArray(value.events)) return null;
  const startedAtMs = Date.parse(value.startedAt);
  if (!Number.isFinite(startedAtMs)) return null;
  const events = value.events.filter(isValidEvent).map(copyEvent)
    .sort((a, b) => a.t - b.t).slice(0, MAX_PERFORMANCE_EVENTS);
  const lastT = events.length ? events[events.length - 1].t : 0;
  const duration = Number.isFinite(value.durationMs) ? value.durationMs : 0;
  return {
    format: PERFORMANCE_FORMAT,
    version: PERFORMANCE_VERSION,
    startedAt: new Date(startedAtMs).toISOString(),
    durationMs: Math.max(0, Math.round(duration), lastT),
    counts: countPerformanceEvents(events),
    truncated: value.truncated === true,
    ...toLoopEndsField(value.loopEnds),
    events,
  };
}

/** @returns {string} Pretty-printed JSON for download. */
export function serializePerformance(performance) {
  return JSON.stringify(performance, null, 2);
}

export function createPerformanceFilename(performance) {
  const stamp = performance.startedAt.replace(/\.\d+Z$/, "Z").replace(
    /[:]/g,
    "-",
  );
  return `scratchlab-performance-${stamp}.json`;
}

/** @returns {string} `m:ss.mmm`. */
export function formatDuration(durationMs) {
  const total = Math.max(0, Math.round(durationMs));
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${
    String(millis).padStart(3, "0")
  }`;
}

/**
 * Turns a performance into drawable lanes. Each lane is a list of segments
 * that last from one event until the next event in the same lane (or the end
 * of the recording), expressed as percentages of the duration.
 * @param {object} performance A normalized performance.
 * @returns {{durationMs: number, lanes: object[]}}
 */
export function buildTimeline(performance) {
  const duration = Math.max(1, performance.durationMs);
  const toPercent = (ms) => Math.min(100, Math.max(0, (ms / duration) * 100));
  const lane = (id, label, type) => {
    const events = performance.events.filter((event) => event.type === type);
    const segments = events.map((event, index) => {
      const end = events[index + 1]?.t ?? performance.durationMs;
      const start = toPercent(event.t);
      return {
        kind: type === "scratch" ? event.direction : event.state,
        startMs: event.t,
        endMs: end,
        left: start,
        width: Math.max(0, toPercent(end) - start),
      };
    });
    return { id, label, segments };
  };
  return {
    durationMs: performance.durationMs,
    lanes: [
      lane("scratch", "スクラッチ", "scratch"),
      lane("fader", "フェーダー", "fader"),
    ],
  };
}

/**
 * Stores the latest performance under a versioned key. Corrupt data reads as
 * no recording, and data from a newer version is never overwritten.
 * @param {Storage|null} storage LocalStorage-compatible object.
 */
export function createPerformanceRepository(
  storage = getBrowserStorage(),
  key = PERFORMANCE_STORAGE_KEY,
) {
  function read() {
    if (!storage) return { status: "unavailable", performance: null };
    const result = safeGetItem(storage, key);
    if (!result.ok) {
      return { status: "unavailable", performance: null };
    }
    const text = result.value;
    if (text === null) return { status: "empty", performance: null };
    try {
      const data = JSON.parse(text);
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        return { status: "corrupt", performance: null };
      }
      const version = data.version ?? 0;
      if (!Number.isInteger(version) || version < 0) {
        return { status: "corrupt", performance: null };
      }
      if (version > PERFORMANCE_VERSION) {
        return { status: "future", performance: null };
      }
      const performance = normalizePerformance(data.performance);
      return performance
        ? { status: "ok", performance }
        : { status: "corrupt", performance: null };
    } catch {
      return { status: "corrupt", performance: null };
    }
  }

  return {
    get available() {
      return Boolean(storage);
    },
    load() {
      return read().performance;
    },
    save(performance) {
      const normalized = normalizePerformance(performance);
      if (!normalized) return { ok: false, reason: "invalid" };
      const { status } = read();
      if (status === "unavailable") return { ok: false, reason: "unavailable" };
      if (status === "future") return { ok: false, reason: "future-version" };
      try {
        const result = safeSetItem(
          storage,
          key,
          JSON.stringify({
            version: PERFORMANCE_VERSION,
            performance: normalized,
          }),
        );
        return result.ok ? { ok: true } : { ok: false, reason: "write-failed" };
      } catch {
        return { ok: false, reason: "write-failed" };
      }
    },
    clear() {
      const { status } = read();
      if (status === "unavailable") return { ok: false, reason: "unavailable" };
      if (status === "future") return { ok: false, reason: "future-version" };
      const result = safeRemoveItem(storage, key);
      return result.ok ? { ok: true } : { ok: false, reason: "write-failed" };
    },
  };
}
