import { getBrowserStorage } from "./chart-storage.js";
import { EVENT_MODEL_VERSION } from "./performance-analysis.js";
import { safeGetItem, safeRemoveItem, safeSetItem } from "./storage-utils.js";

export const GHOST_STORAGE_KEY = "scratchlab.ghost";
const GHOST_STORAGE_VERSION = 1;

const emptyStorage = () => ({ version: GHOST_STORAGE_VERSION, bestRuns: {} });
const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isScore = (value) => Number.isFinite(value) && value >= 0 && value <= 100;
const isChartId = (value) =>
  typeof value === "string" && value.trim().length > 0;

function normalizeRecord(record) {
  if (
    !isObject(record) || !isChartId(record.chartId) ||
    record.eventModelVersion !== EVENT_MODEL_VERSION ||
    !Number.isFinite(record.bpm) || record.bpm <= 0 ||
    !isScore(record.accuracy) ||
    !(record.timingAccuracy === null || isScore(record.timingAccuracy)) ||
    !Number.isFinite(record.recordedAt) || record.recordedAt < 0 ||
    !Array.isArray(record.recordedTimeline)
  ) return null;

  const recordedTimeline = [];
  let previousTime = -Infinity;
  for (const event of record.recordedTimeline) {
    if (!isObject(event)) return null;
    if (event.type === "stop" || event.type === "loop-boundary") continue;
    if (
      !Number.isFinite(event.time) || event.time < 0 ||
      event.time < previousTime
    ) return null;
    if (
      event.type === "scratch" &&
      ["forward", "backward"].includes(event.direction)
    ) {
      recordedTimeline.push({
        type: "scratch",
        direction: event.direction,
        time: event.time,
      });
    } else if (
      event.type === "fader" && ["open", "closed"].includes(event.state)
    ) {
      recordedTimeline.push({
        type: "fader",
        state: event.state,
        time: event.time,
      });
    } else return null;
    previousTime = event.time;
  }
  return {
    chartId: record.chartId,
    eventModelVersion: record.eventModelVersion,
    bpm: record.bpm,
    accuracy: record.accuracy,
    timingAccuracy: record.timingAccuracy,
    recordedAt: record.recordedAt,
    recordedTimeline,
  };
}

function normalizeStorage(data) {
  if (
    !isObject(data) || data.version !== GHOST_STORAGE_VERSION ||
    !isObject(data.bestRuns)
  ) return null;
  const entries = [];
  for (const [chartId, value] of Object.entries(data.bestRuns)) {
    const record = normalizeRecord(value);
    if (!record || record.chartId !== chartId) return null;
    entries.push([chartId, record]);
  }
  return {
    version: GHOST_STORAGE_VERSION,
    bestRuns: Object.fromEntries(entries),
  };
}

function readStorage(storage) {
  if (!storage) return { status: "unavailable", data: emptyStorage() };
  const result = safeGetItem(storage, GHOST_STORAGE_KEY);
  if (!result.ok) return { status: "unavailable", data: emptyStorage() };
  if (result.value === null) return { status: "empty", data: emptyStorage() };
  let parsed;
  try {
    parsed = JSON.parse(result.value);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return { status: "corrupt", data: emptyStorage() };
  }
  if (isObject(parsed) && parsed.version > GHOST_STORAGE_VERSION) {
    return { status: "future-version", data: emptyStorage() };
  }
  const data = normalizeStorage(parsed);
  return data
    ? { status: "ok", data }
    : { status: "corrupt", data: emptyStorage() };
}

function writableFailure(status) {
  if (status === "unavailable" || status === "future-version") {
    return { ok: false, reason: status };
  }
  return null;
}

/**
 * Returns an empty store on missing, corrupt, unsupported, or inaccessible data.
 * @param {Storage|null} storage Optional LocalStorage-compatible backend.
 */
export function loadGhostStorage(storage = getBrowserStorage()) {
  const { status, data } = readStorage(storage);
  if (!["ok", "empty"].includes(status)) {
    console.warn(`Ghost storage could not be loaded: ${status}`);
  }
  return data;
}

/**
 * Saves only the Ghost schema; never writes to other application keys.
 * @param {object} data Ghost storage document.
 * @param {Storage|null} storage Optional LocalStorage-compatible backend.
 */
export function saveGhostStorage(data, storage = getBrowserStorage()) {
  const normalized = normalizeStorage(data);
  if (!normalized) return { ok: false, reason: "invalid" };
  const failure = writableFailure(readStorage(storage).status);
  if (failure) return failure;
  const result = safeSetItem(
    storage,
    GHOST_STORAGE_KEY,
    JSON.stringify(normalized),
  );
  return result.ok ? { ok: true } : { ok: false, reason: "write-failed" };
}

/**
 * Returns a detached record, or null when the chart has no usable Ghost.
 * @param {string} chartId Chart identifier.
 * @param {Storage|null} storage Optional LocalStorage-compatible backend.
 */
export function getBestRun(chartId, storage = getBrowserStorage()) {
  if (!isChartId(chartId)) throw new TypeError("A chartId is required");
  const { bestRuns } = loadGhostStorage(storage);
  return Object.hasOwn(bestRuns, chartId) ? bestRuns[chartId] : null;
}

function isBetter(candidate, current) {
  if (candidate.accuracy !== current.accuracy) {
    return candidate.accuracy > current.accuracy;
  }
  if (candidate.timingAccuracy !== current.timingAccuracy) {
    return (candidate.timingAccuracy ?? -1) > (current.timingAccuracy ?? -1);
  }
  return candidate.recordedAt > current.recordedAt;
}

/**
 * Updates one chart by Accuracy, Timing Accuracy (null last), then recency.
 * @param {object} record Candidate GhostRecord.
 * @param {Storage|null} storage Optional LocalStorage-compatible backend.
 */
export function updateBestRun(record, storage = getBrowserStorage()) {
  const candidate = normalizeRecord(record);
  if (!candidate) return { ok: false, reason: "invalid" };
  const { status, data } = readStorage(storage);
  const failure = writableFailure(status);
  if (failure) return failure;
  const current = Object.hasOwn(data.bestRuns, candidate.chartId)
    ? data.bestRuns[candidate.chartId]
    : null;
  if (current && !isBetter(candidate, current)) {
    return { ok: true, updated: false };
  }
  const result = saveGhostStorage({
    version: GHOST_STORAGE_VERSION,
    bestRuns: { ...data.bestRuns, [candidate.chartId]: candidate },
  }, storage);
  return result.ok ? { ok: true, updated: true } : result;
}

/**
 * Explicitly removes only the Ghost key. Unsupported future data is protected.
 * @param {Storage|null} storage Optional LocalStorage-compatible backend.
 */
export function clearGhostStorage(storage = getBrowserStorage()) {
  const failure = writableFailure(readStorage(storage).status);
  if (failure) return failure;
  const result = safeRemoveItem(storage, GHOST_STORAGE_KEY);
  return result.ok ? { ok: true } : { ok: false, reason: "write-failed" };
}
