import { getBrowserStorage } from "./chart-storage.js";
import { EVENT_MODEL_VERSION } from "./performance-analysis.js";
import { safeGetItem, safeRemoveItem, safeSetItem } from "./storage-utils.js";

export const REPLAY_STORAGE_KEY = "scratchlab.replay";
const VERSION = 1;
const emptyStorage = () => ({ version: VERSION, replays: {} });
const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isId = (value) => typeof value === "string" && value.trim().length > 0;
const isTime = (value) => Number.isFinite(value) && value >= 0;
const directions = ["unknown", "forward", "backward", "stopped"];
const faderStates = ["unknown", "open", "closed"];
const pick = (value, keys) =>
  Object.fromEntries(
    keys.filter((key) => Object.hasOwn(value, key)).map(
      (key) => [key, value[key]],
    ),
  );

function normalizeLoop(loop) {
  if (
    !isObject(loop) || !Number.isInteger(loop.loopIndex) ||
    loop.loopIndex < 0 ||
    !["demo", "recording"].includes(loop.phase) ||
    !isTime(loop.startTime) || !isTime(loop.endTime) ||
    loop.endTime <= loop.startTime ||
    (Object.hasOwn(loop, "sessionId") && !isId(loop.sessionId)) ||
    (Object.hasOwn(loop, "startDirection") &&
      !directions.includes(loop.startDirection)) ||
    (Object.hasOwn(loop, "startFaderState") &&
      !faderStates.includes(loop.startFaderState))
  ) return null;
  return pick(loop, [
    "loopIndex",
    "startTime",
    "endTime",
    "phase",
    "sessionId",
    "startDirection",
    "startFaderState",
  ]);
}

function normalizeEvent(event) {
  if (!isObject(event) || !isTime(event.time)) return null;
  if (
    event.type === "scratch" &&
    ["forward", "backward"].includes(event.direction)
  ) return pick(event, ["type", "direction", "time"]);
  if (
    event.type === "fader" && ["open", "closed"].includes(event.state)
  ) return pick(event, ["type", "state", "time"]);
  if (
    event.type === "stop" && event.reason === "inactivity" &&
    ["mouse", "midi"].includes(event.source) && isTime(event.lastMovementAt) &&
    Number.isFinite(event.timeoutMs) && event.timeoutMs > 0 &&
    event.time === event.lastMovementAt + event.timeoutMs
  ) {
    return pick(event, [
      "type",
      "reason",
      "source",
      "lastMovementAt",
      "timeoutMs",
      "time",
    ]);
  }
  if (
    event.type === "loop-boundary" &&
    ["start", "end"].includes(event.edge) && isId(event.sessionId) &&
    Number.isInteger(event.loopIndex) && event.loopIndex >= 0 &&
    ["demo", "recording"].includes(event.phase) &&
    directions.includes(event.currentDirection) &&
    faderStates.includes(event.faderState)
  ) {
    return pick(event, [
      "type",
      "edge",
      "sessionId",
      "loopIndex",
      "phase",
      "time",
      "currentDirection",
      "faderState",
    ]);
  }
  return null;
}

function normalizeRecord(record) {
  if (
    !isObject(record) || record.version !== VERSION || !isId(record.chartId) ||
    record.eventModelVersion !== EVENT_MODEL_VERSION ||
    !Number.isFinite(record.bpm) || record.bpm <= 0 ||
    !isTime(record.recordedAt) || !isObject(record.replayContext) ||
    !Array.isArray(record.recordedTimeline)
  ) return null;
  const context = record.replayContext;
  if (
    !isTime(context.recordingStartedAt) ||
    !Number.isInteger(context.recordingLoopCount) ||
    context.recordingLoopCount <= 0 || !Array.isArray(context.loopStates) ||
    context.loopStates.length === 0
  ) return null;
  const loopStates = [];
  for (const value of context.loopStates) {
    const loop = normalizeLoop(value);
    const previous = loopStates.at(-1);
    if (
      !loop || (previous && (
        loop.loopIndex <= previous.loopIndex ||
        loop.startTime < previous.endTime ||
        loop.sessionId !== previous.sessionId
      ))
    ) return null;
    loopStates.push(loop);
  }
  const recordingLoops = loopStates.filter((loop) =>
    loop.phase === "recording"
  );
  if (
    recordingLoops.length !== context.recordingLoopCount ||
    recordingLoops[0].startTime !== context.recordingStartedAt
  ) return null;
  const recordedTimeline = [];
  for (const value of record.recordedTimeline) {
    const event = normalizeEvent(value);
    if (!event || event.time < (recordedTimeline.at(-1)?.time ?? 0)) {
      return null;
    }
    recordedTimeline.push(event);
  }
  return {
    version: VERSION,
    chartId: record.chartId,
    eventModelVersion: record.eventModelVersion,
    bpm: record.bpm,
    recordedAt: record.recordedAt,
    replayContext: {
      recordingStartedAt: context.recordingStartedAt,
      recordingLoopCount: context.recordingLoopCount,
      loopStates,
    },
    recordedTimeline,
  };
}

function normalizeStorage(data) {
  if (!isObject(data) || data.version !== VERSION || !isObject(data.replays)) {
    return null;
  }
  const entries = [];
  for (const [chartId, value] of Object.entries(data.replays)) {
    const record = normalizeRecord(value);
    if (!record || record.chartId !== chartId) return null;
    entries.push([chartId, record]);
  }
  return { version: VERSION, replays: Object.fromEntries(entries) };
}

function readStorage(storage) {
  if (!storage) return { status: "unavailable", data: emptyStorage() };
  const result = safeGetItem(storage, REPLAY_STORAGE_KEY);
  if (!result.ok) return { status: "unavailable", data: emptyStorage() };
  if (result.value === null) return { status: "empty", data: emptyStorage() };
  let parsed;
  try {
    parsed = JSON.parse(result.value);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return { status: "corrupt", data: emptyStorage() };
  }
  if (isObject(parsed) && parsed.version > VERSION) {
    return { status: "future-version", data: emptyStorage() };
  }
  const data = normalizeStorage(parsed);
  return data
    ? { status: "ok", data }
    : { status: "corrupt", data: emptyStorage() };
}

function writableFailure(status) {
  return ["unavailable", "future-version"].includes(status)
    ? { ok: false, reason: status }
    : null;
}

/** Returns an empty store on missing, corrupt, or inaccessible data. */
export function loadReplayStorage(storage = getBrowserStorage()) {
  const { status, data } = readStorage(storage);
  if (!["ok", "empty"].includes(status)) {
    console.warn(`Replay storage could not be loaded: ${status}`);
  }
  return data;
}

/** Explicitly replaces the Replay document, projecting only approved fields. */
export function saveReplayStorage(data, storage = getBrowserStorage()) {
  const normalized = normalizeStorage(data);
  if (!normalized) return { ok: false, reason: "invalid" };
  const failure = writableFailure(readStorage(storage).status);
  if (failure) return failure;
  const result = safeSetItem(
    storage,
    REPLAY_STORAGE_KEY,
    JSON.stringify(normalized),
  );
  return result.ok ? { ok: true } : { ok: false, reason: "write-failed" };
}

/** Returns a detached ReplayRecord, or null when no usable record exists. */
export function getReplay(chartId, storage = getBrowserStorage()) {
  if (!isId(chartId)) throw new TypeError("A chartId is required");
  const { replays } = loadReplayStorage(storage);
  return Object.hasOwn(replays, chartId) ? replays[chartId] : null;
}

/** Replaces one chart's Replay, without comparing scores or changing other charts. */
export function saveReplay(record, storage = getBrowserStorage()) {
  const candidate = normalizeRecord(record);
  if (!candidate) return { ok: false, reason: "invalid" };
  const { status, data } = readStorage(storage);
  const failure = writableFailure(status);
  if (failure) return failure;
  return saveReplayStorage({
    version: VERSION,
    replays: { ...data.replays, [candidate.chartId]: candidate },
  }, storage);
}

/** Explicitly removes only the Replay key, protecting unsupported future data. */
export function clearReplayStorage(storage = getBrowserStorage()) {
  const failure = writableFailure(readStorage(storage).status);
  if (failure) return failure;
  const result = safeRemoveItem(storage, REPLAY_STORAGE_KEY);
  return result.ok ? { ok: true } : { ok: false, reason: "write-failed" };
}
