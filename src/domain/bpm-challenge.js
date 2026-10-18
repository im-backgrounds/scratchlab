import { getBrowserStorage } from "./chart-storage.js";
import { safeGetItem, safeRemoveItem, safeSetItem } from "./storage-utils.js";

export const CHALLENGE_STORAGE_KEY = "scratchlab.challenge";
export const CHALLENGE_VERSION = 1;
export const MAX_CHALLENGE_CHARTS = 200;

export const CHALLENGE_RULES = Object.freeze({
  startBpm: 80,
  minBpm: 60,
  maxBpm: 180,
  bpmStep: 5,
  passAccuracy: 90,
  // The take may last at most this many times the chart's expected length.
  durationTolerance: 1.2,
});

const CHART_KEY_PATTERN = /^(builtin|saved):.{1,100}$/;

/**
 * Builds the key progress is stored under. Unsaved builder charts have no
 * stable identity, so they are not eligible and get no key.
 * @param {{type: "builtin"|"saved"|"draft", id?: string|null}} source
 * @returns {string|null}
 */
export function createChartKey(source) {
  if (!source || (source.type !== "builtin" && source.type !== "saved")) {
    return null;
  }
  if (typeof source.id !== "string" || !source.id) return null;
  const key = `${source.type}:${source.id}`;
  return isChartKey(key) ? key : null;
}

export function isChartKey(value) {
  return typeof value === "string" && CHART_KEY_PATTERN.test(value);
}

/** @returns {object} Progress of a chart that was never attempted. */
export function createEmptyProgress() {
  return {
    highestClearedBpm: null,
    attempts: 0,
    clears: 0,
    bestAccuracy: null,
    lastAttempt: null,
  };
}

/**
 * The BPM to challenge next. It is derived, never stored: the start BPM until
 * something is cleared, then one step above the highest cleared BPM.
 */
export function deriveCurrentBpm(progress, rules = CHALLENGE_RULES) {
  if (progress.highestClearedBpm === null) return rules.startBpm;
  return Math.min(progress.highestClearedBpm + rules.bpmStep, rules.maxBpm);
}

/** True once the maximum BPM has been cleared. */
export function isChallengeComplete(progress, rules = CHALLENGE_RULES) {
  return progress.highestClearedBpm !== null &&
    progress.highestClearedBpm >= rules.maxBpm;
}

/**
 * How long a take of the whole chart lasts at `bpm`.
 * @param {{totalTicks: number, tickDurationSeconds: number}} scoreData
 */
export function getExpectedDurationMs(scoreData, bpm) {
  return scoreData.totalTicks * scoreData.tickDurationSeconds * 60000 / bpm;
}

export function isDurationValid(
  actualDurationMs,
  expectedDurationMs,
  rules = CHALLENGE_RULES,
) {
  return Number.isFinite(actualDurationMs) && actualDurationMs > 0 &&
    Number.isFinite(expectedDurationMs) && expectedDurationMs > 0 &&
    actualDurationMs <= expectedDurationMs * rules.durationTolerance;
}

/**
 * Applies one attempt to a chart's progress without mutating it.
 *
 * - Attempts without an accuracy (nothing recorded) or at a BPM other than
 *   the current one are ignored and not counted.
 * - A take that is too slow counts as a failed attempt and never updates the
 *   best accuracy or the cleared BPM.
 * @param {object} progress Current progress.
 * @param {{bpm: number, accuracy: number|null, actualDurationMs: number,
 *   expectedDurationMs: number, at?: string}} attempt
 * @returns {{progress: object, result: {status: string, reason?: string,
 *   cleared?: boolean, valid?: boolean}}}
 */
export function evaluateAttempt(progress, attempt, rules = CHALLENGE_RULES) {
  const ignored = (reason) => ({
    progress,
    result: { status: "ignored", reason },
  });
  const { bpm, accuracy, actualDurationMs, expectedDurationMs } = attempt;

  if (typeof accuracy !== "number" || !Number.isFinite(accuracy)) {
    return ignored("no-accuracy");
  }
  if (!Number.isFinite(actualDurationMs) || actualDurationMs <= 0) {
    return ignored("no-recording");
  }
  if (!Number.isFinite(expectedDurationMs) || expectedDurationMs <= 0) {
    return ignored("invalid-expected-duration");
  }
  if (bpm !== deriveCurrentBpm(progress, rules)) return ignored("bpm-mismatch");

  const clampedAccuracy = Math.min(100, Math.max(0, accuracy));
  const valid = isDurationValid(actualDurationMs, expectedDurationMs, rules);
  const cleared = valid && clampedAccuracy >= rules.passAccuracy;

  const next = {
    highestClearedBpm: cleared
      ? Math.max(progress.highestClearedBpm ?? 0, bpm)
      : progress.highestClearedBpm,
    attempts: progress.attempts + 1,
    clears: progress.clears + (cleared ? 1 : 0),
    bestAccuracy: valid
      ? Math.max(progress.bestAccuracy ?? 0, clampedAccuracy)
      : progress.bestAccuracy,
    lastAttempt: {
      bpm,
      accuracy: clampedAccuracy,
      cleared,
      valid,
      at: attempt.at ?? new Date().toISOString(),
    },
  };
  return { progress: next, result: { status: "counted", cleared, valid } };
}

export const SAVE_CHART_MESSAGE =
  "Save this chart before starting a challenge.";

/**
 * Builds everything the challenge panel shows. The current challenge BPM is
 * derived from the progress here, never read from storage.
 * @param {{chartKey: string|null, progress?: object, active?: boolean}} input
 *   A null `chartKey` means the chart is not eligible (e.g. an unsaved
 *   builder chart).
 */
export function describeChallenge(
  { chartKey, progress = createEmptyProgress(), active = false },
  rules = CHALLENGE_RULES,
) {
  const eligible = chartKey !== null;
  const complete = eligible && isChallengeComplete(progress, rules);
  const last = progress.lastAttempt;
  return {
    eligible,
    unavailableMessage: eligible ? null : SAVE_CHART_MESSAGE,
    active,
    complete,
    currentBpm: eligible ? deriveCurrentBpm(progress, rules) : null,
    highestClearedBpm: progress.highestClearedBpm,
    bestAccuracy: progress.bestAccuracy,
    attempts: progress.attempts,
    clears: progress.clears,
    lastAttempt: last,
    canStart: eligible && !active && !complete,
    canReset: eligible && !active &&
      (progress.attempts > 0 || progress.highestClearedBpm !== null),
  };
}

function toCount(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function toAccuracy(value) {
  return typeof value === "number" && Number.isFinite(value) &&
      value >= 0 && value <= 100
    ? value
    : null;
}

// Snaps a stored BPM down onto the step grid, so a hand-edited value cannot
// derive an off-grid challenge BPM. Values below the start BPM are dropped.
function toClearedBpm(value, rules) {
  if (!Number.isInteger(value) || value < rules.startBpm) return null;
  const capped = Math.min(value, rules.maxBpm);
  return rules.startBpm +
    Math.floor((capped - rules.startBpm) / rules.bpmStep) * rules.bpmStep;
}

function normalizeLastAttempt(raw, rules) {
  if (!raw || typeof raw !== "object") return null;
  const accuracy = toAccuracy(raw.accuracy);
  if (
    !Number.isInteger(raw.bpm) || raw.bpm < rules.minBpm ||
    raw.bpm > rules.maxBpm || accuracy === null ||
    typeof raw.at !== "string" || Number.isNaN(Date.parse(raw.at))
  ) return null;
  return {
    bpm: raw.bpm,
    accuracy,
    cleared: raw.cleared === true,
    valid: raw.valid !== false,
    at: raw.at,
  };
}

/**
 * Repairs stored progress into a consistent shape. Unknown fields (such as a
 * legacy `currentBpm`) are dropped.
 * @returns {object} Always a valid progress object.
 */
export function normalizeProgress(raw, rules = CHALLENGE_RULES) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return createEmptyProgress();
  }
  const highestClearedBpm = toClearedBpm(raw.highestClearedBpm, rules);
  let clears = toCount(raw.clears);
  let attempts = toCount(raw.attempts);
  if (highestClearedBpm !== null) clears = Math.max(clears, 1);
  attempts = Math.max(attempts, clears);
  return {
    highestClearedBpm,
    attempts,
    clears,
    bestAccuracy: toAccuracy(raw.bestAccuracy),
    lastAttempt: normalizeLastAttempt(raw.lastAttempt, rules),
  };
}

/**
 * Upgrade functions keyed by the version they read, each returning the next
 * version's shape.
 */
export const MIGRATIONS = {
  // Version 0 is data without a `version` field. Per-chart progress is
  // carried over, but a stored `currentBpm` is dropped: it is derived now.
  0: (data) => ({
    version: 1,
    charts: data.charts && typeof data.charts === "object" &&
        !Array.isArray(data.charts)
      ? data.charts
      : {},
  }),
};

export function createEmptyChallengeStore() {
  return { version: CHALLENGE_VERSION, charts: {} };
}

function recency(progress) {
  return progress.lastAttempt ? Date.parse(progress.lastAttempt.at) : 0;
}

function normalizeStore(data, rules) {
  const entries = [];
  for (const [key, value] of Object.entries(data.charts ?? {})) {
    if (isChartKey(key)) entries.push([key, normalizeProgress(value, rules)]);
  }
  // Keep the most recently attempted charts when over the limit.
  entries.sort((a, b) => recency(b[1]) - recency(a[1]));
  return {
    version: CHALLENGE_VERSION,
    charts: Object.fromEntries(entries.slice(0, MAX_CHALLENGE_CHARTS)),
  };
}

/**
 * @returns {{store: object, status: "ok"|"empty"|"corrupt"|"future"}}
 *   `future` means a newer app version wrote the data, so it must not be
 *   overwritten.
 */
export function parseChallengeStore(
  text,
  migrations = MIGRATIONS,
  rules = CHALLENGE_RULES,
) {
  if (text === null || text === undefined || text === "") {
    return { store: createEmptyChallengeStore(), status: "empty" };
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { store: createEmptyChallengeStore(), status: "corrupt" };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { store: createEmptyChallengeStore(), status: "corrupt" };
  }
  let version = Number.isInteger(data.version) ? data.version : 0;
  if (version > CHALLENGE_VERSION || version < 0) {
    return { store: createEmptyChallengeStore(), status: "future" };
  }
  while (version < CHALLENGE_VERSION) {
    const migrate = migrations[version];
    if (!migrate) {
      return { store: createEmptyChallengeStore(), status: "corrupt" };
    }
    data = migrate(data);
    version = data.version;
  }
  return { store: normalizeStore(data, rules), status: "ok" };
}

/**
 * LocalStorage-backed BPM challenge progress, one entry per chart. Every
 * mutation re-reads storage first so multiple tabs cannot overwrite each
 * other with stale snapshots.
 * @param {Storage|null} storage Storage-like object, or null if unavailable.
 * @param {{key?: string, rules?: object}} [options]
 */
export function createChallengeRepository(
  storage = getBrowserStorage(),
  options = {},
) {
  const key = options.key ?? CHALLENGE_STORAGE_KEY;
  const rules = options.rules ?? CHALLENGE_RULES;

  function read() {
    if (!storage) {
      return { store: createEmptyChallengeStore(), status: "unavailable" };
    }
    const result = safeGetItem(storage, key);
    if (!result.ok) {
      return { store: createEmptyChallengeStore(), status: "unavailable" };
    }
    try {
      return parseChallengeStore(result.value, MIGRATIONS, rules);
    } catch {
      return { store: createEmptyChallengeStore(), status: "unavailable" };
    }
  }

  function write(store) {
    try {
      const result = safeSetItem(
        storage,
        key,
        JSON.stringify(normalizeStore(store, rules)),
      );
      return result.ok ? { ok: true } : { ok: false, reason: "write-failed" };
    } catch {
      return { ok: false, reason: "write-failed" };
    }
  }

  // Runs `change` against a fresh copy of the store and writes the result.
  function mutate(change) {
    const { store, status } = read();
    if (status === "unavailable") return { ok: false, reason: "unavailable" };
    if (status === "future") return { ok: false, reason: "future-version" };
    const outcome = change(store);
    if (outcome.skipWrite) return { ok: true, ...outcome.value };
    const written = write(store);
    return written.ok ? { ok: true, ...outcome.value } : written;
  }

  return {
    get available() {
      return Boolean(storage);
    },
    /** @returns {object} Progress of the chart, empty when never attempted. */
    get(chartKey) {
      const progress = read().store.charts[chartKey];
      return progress ? { ...progress } : createEmptyProgress();
    },
    /** Evaluates and persists an attempt; ignored attempts are not written. */
    recordAttempt(chartKey, attempt) {
      if (!isChartKey(chartKey)) return { ok: false, reason: "invalid" };
      return mutate((store) => {
        const current = store.charts[chartKey] ?? createEmptyProgress();
        const { progress, result } = evaluateAttempt(current, attempt, rules);
        if (result.status === "ignored") {
          return { skipWrite: true, value: { progress: current, result } };
        }
        store.charts[chartKey] = progress;
        return { value: { progress, result } };
      });
    },
    /** Forgets one chart's progress, e.g. on reset or chart deletion. */
    remove(chartKey) {
      if (!isChartKey(chartKey)) return { ok: false, reason: "invalid" };
      return mutate((store) => {
        if (!(chartKey in store.charts)) {
          return { skipWrite: true, value: {} };
        }
        delete store.charts[chartKey];
        return { value: {} };
      });
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
