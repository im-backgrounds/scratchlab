import { getBrowserStorage } from "./chart-storage.js";

export const MIDI_MAPPING_KEY = "scratchlab.midi-mapping";
export const MIDI_MAPPING_VERSION = 1;

export const MIDI_ACTIONS = [
  "forward",
  "backward",
  "stop",
  "fader-open",
  "fader-close",
];

export const MIDI_ACTION_LABELS = {
  "forward": "Forward（前進）",
  "backward": "Backward（後進）",
  "stop": "Stop（停止）",
  "fader-open": "Fader Open（開）",
  "fader-close": "Fader Close（閉）",
};

const NOTE_ON = 0x90;
const CONTROL_CHANGE = 0xb0;

/** @returns {Record<string, object|null>} A mapping with every action unassigned. */
export function createEmptyMapping() {
  return Object.fromEntries(MIDI_ACTIONS.map((action) => [action, null]));
}

/**
 * Describes a raw MIDI message as a mappable control, or null when the message
 * is not a usable trigger (note-off, zero velocity/value, system messages).
 * @param {ArrayLike<number>} data Raw MIDI bytes.
 * @returns {{kind: "note"|"cc", channel: number, number: number}|null}
 */
export function getMidiSignature(data) {
  if (!data || data.length < 3) return null;
  const [status, number, value] = data;
  const type = status & 0xf0;
  const channel = status & 0x0f;
  if (!Number.isInteger(number) || !(value > 0)) return null;
  if (type === NOTE_ON) return { kind: "note", channel, number };
  if (type === CONTROL_CHANGE) return { kind: "cc", channel, number };
  return null;
}

export function describeSignature(signature) {
  if (!signature) return "未割り当て";
  const kind = signature.kind === "note" ? "Note" : "CC";
  return `${kind} ${signature.number} (ch ${signature.channel + 1})`;
}

function isSignature(value) {
  return Boolean(value) && typeof value === "object" &&
    (value.kind === "note" || value.kind === "cc") &&
    Number.isInteger(value.channel) && value.channel >= 0 &&
    value.channel <= 15 &&
    Number.isInteger(value.number) && value.number >= 0 && value.number <= 127;
}

function sameSignature(a, b) {
  return Boolean(a) && Boolean(b) && a.kind === b.kind &&
    a.channel === b.channel && a.number === b.number;
}

/**
 * Assigns a control to an action. A control can drive only one action, so any
 * other action using it is unassigned.
 * @returns {Record<string, object|null>} A new mapping.
 */
export function assignMapping(mapping, action, signature) {
  if (!MIDI_ACTIONS.includes(action) || !isSignature(signature)) {
    throw new Error("MIDIマッピングが不正です。");
  }
  const next = createEmptyMapping();
  for (const key of MIDI_ACTIONS) {
    const current = mapping?.[key];
    if (isSignature(current) && !sameSignature(current, signature)) {
      next[key] = { ...current };
    }
  }
  next[action] = { ...signature };
  return next;
}

export function clearMapping(mapping, action) {
  const next = { ...createEmptyMapping(), ...mapping };
  next[action] = null;
  return next;
}

/**
 * Converts a raw MIDI message to a scratch or fader event.
 * @param {ArrayLike<number>} data Raw MIDI bytes.
 * @param {Record<string, object|null>} mapping Current mapping.
 * @param {number} time Event timestamp in milliseconds.
 * @returns {object|null} `{type, direction|state, time}` or null if unmapped.
 */
export function convertMidiMessage(data, mapping, time) {
  const signature = getMidiSignature(data);
  if (!signature) return null;
  const action = MIDI_ACTIONS.find((key) =>
    sameSignature(mapping?.[key], signature)
  );
  if (!action) return null;
  if (action === "fader-open") return { type: "fader", state: "open", time };
  if (action === "fader-close") return { type: "fader", state: "closed", time };
  return { type: "scratch", direction: action, time };
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
    if (isSignature(raw[action])) {
      const { kind, channel, number } = raw[action];
      mapping[action] = { kind, channel, number };
    }
  }
  return mapping;
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
  function read() {
    if (!storage) {
      return { status: "unavailable", mapping: createEmptyMapping() };
    }
    let text;
    try {
      text = storage.getItem(key);
    } catch {
      return { status: "unavailable", mapping: createEmptyMapping() };
    }
    if (text === null) {
      return { status: "empty", mapping: createEmptyMapping() };
    }
    try {
      const data = JSON.parse(text);
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        return { status: "corrupt", mapping: createEmptyMapping() };
      }
      const version = data.version ?? 0;
      if (!Number.isInteger(version) || version < 0) {
        return { status: "corrupt", mapping: createEmptyMapping() };
      }
      if (version > MIDI_MAPPING_VERSION) {
        return { status: "future", mapping: createEmptyMapping() };
      }
      // Version 0 stored the actions at the top level.
      const source = version === 0 ? data : data.mappings;
      return { status: "ok", mapping: normalizeMapping(source) };
    } catch {
      return { status: "corrupt", mapping: createEmptyMapping() };
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
