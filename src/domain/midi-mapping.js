import { getBrowserStorage } from "./chart-storage.js";

export const MIDI_MAPPING_KEY = "scratchlab.midi-mapping";
export const MIDI_MAPPING_VERSION = 4;

/** Actions the user assigns with Learn. Stop is inferred, never mapped. */
export const MIDI_ACTIONS = ["forward", "backward", "fader"];
export const FIXED_VELOCITY_ACTIONS = ["forward", "backward"];
export const STOP_TIMEOUT_MS = 150;
// A fader is described by three points: the value at the open end, a
// threshold, and the value at the closed end. Values from the open end up to
// the threshold (inclusive) are open and the rest are closed, whichever end
// is the larger number.
export const DEFAULT_FADER = { open: 0, threshold: 120, closed: 127 };

export const MIDI_ACTION_LABELS = {
  "forward": "Forward（前進）",
  "backward": "Backward（後進）",
  "stop": "Stop（停止）",
  "fader": "Fader（開・閉）",
};

const NOTE_ON = 0x90;
const CONTROL_CHANGE = 0xb0;
const MAX_VELOCITY = 127;

/** @returns {Record<string, object|null>} A mapping with every action unassigned. */
export function createEmptyMapping() {
  return Object.fromEntries(MIDI_ACTIONS.map((action) => [action, null]));
}

/**
 * Describes a raw MIDI message as a control plus its velocity, or null when it
 * cannot trigger anything. Note-offs and zero-velocity notes are ignored; a
 * control-change value of 0 is valid because faders rest there.
 * @param {ArrayLike<number>} data Raw MIDI bytes.
 * @returns {{kind: "note"|"cc", channel: number, number: number,
 *   velocity: number}|null}
 */
export function getMidiSignature(data) {
  if (!data || data.length < 3) return null;
  const [status, number, velocity] = data;
  const type = status & 0xf0;
  const channel = status & 0x0f;
  if (!Number.isInteger(number) || !Number.isInteger(velocity)) return null;
  if (type === NOTE_ON && velocity > 0) {
    return { kind: "note", channel, number, velocity };
  }
  if (type === CONTROL_CHANGE) return { kind: "cc", channel, number, velocity };
  return null;
}

function formatRange({ min, max }) {
  return min === max ? `${min}` : `${min}–${max}`;
}

export function describeSignature(entry) {
  if (!entry) return "未割り当て";
  const kind = entry.kind === "note" ? "Note" : "CC";
  const control = `${kind} ${entry.number} (ch ${entry.channel + 1})`;
  if (isFaderEntry(entry)) {
    return `${control} / 開 ${entry.open} 〜 閾値 ${entry.threshold} 〜 閉 ${entry.closed}`;
  }
  return `${control} / ベロシティ ${formatRange(entry)}`;
}

function isByte(value, max) {
  return Number.isInteger(value) && value >= 0 && value <= max;
}

function isRange(value) {
  return Boolean(value) && typeof value === "object" &&
    isByte(value.min, MAX_VELOCITY) && isByte(value.max, MAX_VELOCITY) &&
    value.min <= value.max;
}

function rangesOverlap(a, b) {
  return a.min <= b.max && b.min <= a.max;
}

function isControl(value) {
  return Boolean(value) && typeof value === "object" &&
    (value.kind === "note" || value.kind === "cc") &&
    isByte(value.channel, 15) && isByte(value.number, MAX_VELOCITY);
}

function isFaderEntry(value) {
  if (
    !isControl(value) || !isByte(value.open, MAX_VELOCITY) ||
    !isByte(value.closed, MAX_VELOCITY) ||
    !isByte(value.threshold, MAX_VELOCITY)
  ) {
    return false;
  }
  const { open, threshold, closed } = value;
  return open < closed
    ? open <= threshold && threshold < closed
    : closed < threshold && threshold <= open;
}

function isEntry(action, value) {
  if (action === "fader") return isFaderEntry(value);
  return isControl(value) && isRange(value);
}

function toEntry(action, source) {
  const { kind, channel, number } = source;
  if (action === "fader") {
    const { open, threshold, closed } = "threshold" in source
      ? source
      : DEFAULT_FADER;
    return { kind, channel, number, open, threshold, closed };
  }
  return {
    kind,
    channel,
    number,
    min: source.min ?? source.velocity,
    max: source.max ?? source.velocity,
  };
}

function sameControl(a, b) {
  return a.kind === b.kind && a.channel === b.channel && a.number === b.number;
}

function velocityRanges(entry) {
  if (!isFaderEntry(entry)) return [entry];
  return [{
    min: Math.min(entry.open, entry.closed),
    max: Math.max(entry.open, entry.closed),
  }];
}

function conflicts(a, b) {
  return sameControl(a, b) &&
    velocityRanges(a).some((x) =>
      velocityRanges(b).some((y) => rangesOverlap(x, y))
    );
}

/** Thrown when a mapping would overlap one that belongs to another action. */
export class MidiMappingConflictError extends Error {
  /** @param {string} conflictAction The action that already uses the input. */
  constructor(conflictAction) {
    super(`${conflictAction} に割り当て済みです。`);
    this.name = "MidiMappingConflictError";
    this.conflictAction = conflictAction;
  }
}

/**
 * Assigns a control and velocity condition to an action.
 *
 * - Forward/Backward need one exact velocity.
 * - Fader needs `open`, `threshold` and `closed` values; when omitted (for
 *   example right after Learn) {@link DEFAULT_FADER} is used.
 *
 * Other actions are never changed. If the new condition would match messages
 * that another action already uses, a {@link MidiMappingConflictError} is
 * thrown so a message never means two things.
 * @param {Record<string, object|null>} mapping Current mapping.
 * @param {string} action One of {@link MIDI_ACTIONS}.
 * @param {object} signature `{kind, channel, number}` plus `velocity`,
 *   `min`/`max`, or `open`/`threshold`/`closed`.
 * @returns {Record<string, object|null>} A new mapping.
 * @throws {MidiMappingConflictError} When another action already uses it.
 */
export function assignMapping(mapping, action, signature) {
  if (!MIDI_ACTIONS.includes(action) || !signature) {
    throw new Error("MIDIマッピングが不正です。");
  }
  const entry = toEntry(action, signature);
  if (!isEntry(action, entry)) {
    throw new Error("MIDIマッピングが不正です。");
  }
  if (FIXED_VELOCITY_ACTIONS.includes(action) && entry.min !== entry.max) {
    throw new Error("Forward/Backwardは固定のベロシティが必要です。");
  }
  const next = createEmptyMapping();
  for (const key of MIDI_ACTIONS) {
    const current = mapping?.[key];
    if (!isEntry(key, current)) continue;
    if (key === action) continue;
    if (conflicts(current, entry)) throw new MidiMappingConflictError(key);
    next[key] = toEntry(key, current);
  }
  next[action] = entry;
  return next;
}

/**
 * Swaps which end of the fader is open and which is closed. The threshold is
 * mirrored (127 - threshold) so the same physical position keeps its meaning,
 * then clamped if custom end values would put it outside the open/closed span.
 * @param {object} entry A fader entry.
 * @returns {object} A new fader entry.
 */
export function swapFaderDirection(entry) {
  const { open, closed } = entry;
  const swapped = { ...entry, open: closed, closed: open };
  const mirrored = MAX_VELOCITY - entry.threshold;
  swapped.threshold = swapped.open < swapped.closed
    ? Math.min(Math.max(mirrored, swapped.open), swapped.closed - 1)
    : Math.min(Math.max(mirrored, swapped.closed + 1), swapped.open);
  return swapped;
}

export function clearMapping(mapping, action) {
  const next = { ...createEmptyMapping(), ...mapping };
  next[action] = null;
  return next;
}

function matchEntry(action, entry, signature) {
  if (!entry || !sameControl(entry, signature)) return null;
  const { velocity } = signature;
  const within = ({ min, max }) => velocity >= min && velocity <= max;
  if (action === "fader") {
    const { open, threshold, closed } = entry;
    if (
      velocity < Math.min(open, closed) || velocity > Math.max(open, closed)
    ) {
      return null;
    }
    const isOpen = open < closed
      ? velocity <= threshold
      : velocity >= threshold;
    return { type: "fader", state: isOpen ? "open" : "closed" };
  }
  return within(entry) ? { type: "scratch", direction: action } : null;
}

/**
 * Converts a raw MIDI message to a scratch or fader event. Stop is not
 * produced here because it is the absence of Forward/Backward input; see
 * {@link createStopDetector}.
 * @param {ArrayLike<number>} data Raw MIDI bytes.
 * @param {Record<string, object|null>} mapping Current mapping.
 * @param {number} time Event timestamp in milliseconds.
 * @returns {object|null} `{type, direction|state, time}` or null if unmapped.
 */
export function convertMidiMessage(data, mapping, time) {
  const signature = getMidiSignature(data);
  if (!signature) return null;
  for (const action of MIDI_ACTIONS) {
    const match = matchEntry(action, mapping?.[action], signature);
    if (match) return { ...match, time };
  }
  return null;
}

/**
 * Decides what an incoming message means. While learning, the first usable
 * message becomes the mapping for the pending action instead of an event.
 * @param {ArrayLike<number>} data Raw MIDI bytes.
 * @param {{mapping: object, learnAction: string|null, time: number}} context
 * @returns {{kind: "learned", action: string, signature: object}
 *   | {kind: "event", event: object} | {kind: "ignored"}}
 */
export function routeMidiMessage(data, { mapping, learnAction, time }) {
  if (learnAction) {
    const signature = getMidiSignature(data);
    return signature
      ? { kind: "learned", action: learnAction, signature }
      : { kind: "ignored" };
  }
  const event = convertMidiMessage(data, mapping, time);
  return event ? { kind: "event", event } : { kind: "ignored" };
}

/**
 * Emits a stop event once no Forward/Backward event has arrived for
 * `timeoutMs`. The stop is stamped with the moment it was recognized.
 * @param {{onStop: (event: object) => void, timeoutMs?: number,
 *   setTimer?: Function, clearTimer?: Function}} options
 */
export function createStopDetector({
  onStop,
  timeoutMs = STOP_TIMEOUT_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let timer = null;
  const cancel = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
  return {
    observe(event) {
      if (event.type !== "scratch") return;
      cancel();
      timer = setTimer(() => {
        timer = null;
        onStop({
          type: "scratch",
          direction: "stop",
          time: event.time + timeoutMs,
        });
      }, timeoutMs);
    },
    cancel,
  };
}

export function formatMidiActionEvent(event, startTime = event.time) {
  const seconds = ((event.time - startTime) / 1000).toFixed(3);
  const label = event.type === "scratch"
    ? `scratch ${event.direction}`
    : `fader ${event.state}`;
  return `+${seconds}s ${label}`;
}

function normalizeMapping(raw) {
  const mapping = createEmptyMapping();
  if (!raw || typeof raw !== "object") return mapping;
  for (const action of MIDI_ACTIONS) {
    if (isEntry(action, raw[action])) {
      mapping[action] = toEntry(action, raw[action]);
    }
  }
  return mapping;
}

function complementRange(range) {
  if (range.min > 0) return { min: 0, max: range.min - 1 };
  if (range.max < MAX_VELOCITY) {
    return { min: range.max + 1, max: MAX_VELOCITY };
  }
  return null;
}

// Version 3 merged the separate fader-open/fader-close actions into one
// `fader` entry. The open control is kept; a missing or conflicting closed
// range becomes the rest of the velocity range.
function mergeFaders(source) {
  const open = source["fader-open"];
  const closed = source["fader-close"];
  const base = isControl(open) && isRange(open) ? open : null;
  const other = isControl(closed) && isRange(closed) ? closed : null;
  if (!base && !other) return null;
  if (base) {
    const closedRange = other && sameControl(base, other) &&
        !rangesOverlap(base, other)
      ? other
      : complementRange(base);
    return closedRange
      ? { ...base, open: { ...base }, closed: closedRange }
      : null;
  }
  const openRange = complementRange(other);
  return openRange ? { ...other, open: openRange, closed: { ...other } } : null;
}

// Version 1 entries had no velocity condition, so they keep matching every
// non-zero velocity (the old behavior). The mapped Stop action no longer
// exists and is dropped.
function migrateToCurrent(version, source) {
  let data = source && typeof source === "object" ? source : {};
  if (version < 2) {
    const upgraded = {};
    for (const action of ["forward", "backward", "fader-open", "fader-close"]) {
      const entry = data[action];
      if (isControl(entry)) {
        upgraded[action] = { ...entry, min: 1, max: MAX_VELOCITY };
      }
    }
    data = upgraded;
  }
  if (version < 3) {
    const { forward, backward } = data;
    data = { forward, backward, fader: mergeFaders(data) };
  }
  if (version < 4) {
    data = { ...data, fader: rangesToThreshold(data.fader) };
  }
  return data;
}

// Version 3 stored open/closed as ranges. The ends of those ranges become the
// open/closed values and the boundary between them the threshold; a gap
// between them is absorbed by the closed side.
function rangesToThreshold(fader) {
  if (
    !isControl(fader) || !isRange(fader.open) || !isRange(fader.closed) ||
    rangesOverlap(fader.open, fader.closed)
  ) {
    return null;
  }
  const { kind, channel, number, open, closed } = fader;
  return open.max < closed.min
    ? {
      kind,
      channel,
      number,
      open: open.min,
      threshold: open.max,
      closed: closed.max,
    }
    : {
      kind,
      channel,
      number,
      open: open.max,
      threshold: open.min,
      closed: closed.min,
    };
}

/**
 * Stores the mapping under a versioned key. Corrupt data reads as an empty
 * mapping, and data written by a newer version is never overwritten.
 * @param {Storage|null} storage LocalStorage-compatible object.
 */
export function createMidiMappingRepository(
  storage = getBrowserStorage(),
  key = MIDI_MAPPING_KEY,
) {
  const empty = (status) => ({ status, mapping: createEmptyMapping() });

  function read() {
    if (!storage) return empty("unavailable");
    let text;
    try {
      text = storage.getItem(key);
    } catch {
      return empty("unavailable");
    }
    if (text === null) return empty("empty");
    try {
      const data = JSON.parse(text);
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        return empty("corrupt");
      }
      const version = data.version ?? 0;
      if (!Number.isInteger(version) || version < 0) return empty("corrupt");
      if (version > MIDI_MAPPING_VERSION) return empty("future");
      // Version 0 stored the actions at the top level.
      const source = version === 0 ? data : data.mappings;
      return {
        status: "ok",
        mapping: normalizeMapping(migrateToCurrent(version, source)),
      };
    } catch {
      return empty("corrupt");
    }
  }

  return {
    get available() {
      return Boolean(storage);
    },
    load() {
      return read().mapping;
    },
    save(mapping) {
      const { status } = read();
      if (status === "unavailable") return { ok: false, reason: "unavailable" };
      if (status === "future") return { ok: false, reason: "future-version" };
      try {
        storage.setItem(
          key,
          JSON.stringify({
            version: MIDI_MAPPING_VERSION,
            mappings: normalizeMapping(mapping),
          }),
        );
        return { ok: true };
      } catch {
        return { ok: false, reason: "write-failed" };
      }
    },
  };
}
