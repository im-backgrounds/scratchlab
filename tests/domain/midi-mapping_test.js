import assert from "node:assert/strict";
import {
  assignMapping,
  clearMapping,
  convertMidiMessage,
  createEmptyMapping,
  createMidiMappingRepository,
  formatMidiActionEvent,
  getMidiSignature,
  MIDI_MAPPING_KEY,
  routeMidiMessage,
} from "../../src/domain/midi-mapping.js";

function createFakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

const note = (number, velocity = 100, channel = 0) => [
  0x90 | channel,
  number,
  velocity,
];
const cc = (number, value = 127, channel = 0) => [
  0xb0 | channel,
  number,
  value,
];

function fullMapping() {
  let mapping = createEmptyMapping();
  mapping = assignMapping(mapping, "forward", getMidiSignature(note(36)));
  mapping = assignMapping(mapping, "backward", getMidiSignature(note(37)));
  mapping = assignMapping(mapping, "stop", getMidiSignature(cc(10)));
  mapping = assignMapping(mapping, "fader-open", getMidiSignature(note(40)));
  mapping = assignMapping(mapping, "fader-close", getMidiSignature(note(41)));
  return mapping;
}

Deno.test("signatures ignore note-off, zero values and system messages", () => {
  assert.deepEqual(getMidiSignature(note(36)), {
    kind: "note",
    channel: 0,
    number: 36,
  });
  assert.deepEqual(getMidiSignature(cc(7, 1, 3)), {
    kind: "cc",
    channel: 3,
    number: 7,
  });
  assert.equal(getMidiSignature(note(36, 0)), null);
  assert.equal(getMidiSignature([0x80, 36, 64]), null);
  assert.equal(getMidiSignature([0xf8]), null);
  assert.equal(getMidiSignature(cc(7, 0)), null);
  assert.equal(getMidiSignature(undefined), null);
});

Deno.test("assigning a control moves it away from the previous action", () => {
  let mapping = assignMapping(
    createEmptyMapping(),
    "forward",
    getMidiSignature(note(36)),
  );
  mapping = assignMapping(mapping, "stop", getMidiSignature(note(36)));
  assert.equal(mapping.forward, null);
  assert.equal(mapping.stop.number, 36);
  assert.throws(() =>
    assignMapping(mapping, "jump", { kind: "note", channel: 0, number: 1 })
  );
  assert.throws(() =>
    assignMapping(mapping, "stop", { kind: "note", channel: 0, number: 200 })
  );
  assert.equal(clearMapping(mapping, "stop").stop, null);
});

Deno.test("messages convert to scratch and fader events with timestamps", () => {
  const mapping = fullMapping();
  assert.deepEqual(convertMidiMessage(note(36), mapping, 1000), {
    type: "scratch",
    direction: "forward",
    time: 1000,
  });
  assert.deepEqual(convertMidiMessage(note(37), mapping, 1001), {
    type: "scratch",
    direction: "backward",
    time: 1001,
  });
  assert.deepEqual(convertMidiMessage(cc(10), mapping, 1002), {
    type: "scratch",
    direction: "stop",
    time: 1002,
  });
  assert.deepEqual(convertMidiMessage(note(40), mapping, 1003), {
    type: "fader",
    state: "open",
    time: 1003,
  });
  assert.deepEqual(convertMidiMessage(note(41), mapping, 1004), {
    type: "fader",
    state: "closed",
    time: 1004,
  });
});

Deno.test("unmapped, other-channel and note-off messages convert to nothing", () => {
  const mapping = fullMapping();
  assert.equal(convertMidiMessage(note(99), mapping, 0), null);
  assert.equal(convertMidiMessage(note(36, 100, 5), mapping, 0), null);
  assert.equal(convertMidiMessage([0x80, 36, 0], mapping, 0), null);
  assert.equal(convertMidiMessage(cc(36), mapping, 0), null);
  assert.equal(convertMidiMessage(note(36), createEmptyMapping(), 0), null);
});

Deno.test("learn mode captures the next usable message instead of an event", () => {
  const mapping = fullMapping();
  const context = { mapping, learnAction: "fader-open", time: 5 };

  assert.deepEqual(routeMidiMessage([0xf8], context), { kind: "ignored" });
  assert.deepEqual(routeMidiMessage([0x80, 50, 0], context), {
    kind: "ignored",
  });
  // Even a control that is already mapped is learned rather than triggered.
  assert.deepEqual(routeMidiMessage(note(36), context), {
    kind: "learned",
    action: "fader-open",
    signature: { kind: "note", channel: 0, number: 36 },
  });

  const learned = routeMidiMessage(cc(21, 90, 2), context);
  const next = assignMapping(mapping, learned.action, learned.signature);
  assert.deepEqual(next["fader-open"], { kind: "cc", channel: 2, number: 21 });
  assert.deepEqual(
    routeMidiMessage(cc(21, 90, 2), {
      mapping: next,
      learnAction: null,
      time: 9,
    }),
    {
      kind: "event",
      event: { type: "fader", state: "open", time: 9 },
    },
  );
});

Deno.test("outside learn mode unmapped messages are ignored", () => {
  assert.deepEqual(
    routeMidiMessage(note(1), {
      mapping: createEmptyMapping(),
      learnAction: null,
      time: 0,
    }),
    { kind: "ignored" },
  );
});

Deno.test("mappings persist across repository instances", () => {
  const storage = createFakeStorage();
  const mapping = fullMapping();
  assert.deepEqual(createMidiMappingRepository(storage).save(mapping), {
    ok: true,
  });
  assert.deepEqual(createMidiMappingRepository(storage).load(), mapping);
  assert.equal(JSON.parse(storage.getItem(MIDI_MAPPING_KEY)).version, 1);
});

Deno.test("an empty or unavailable storage loads an empty mapping", () => {
  assert.deepEqual(
    createMidiMappingRepository(createFakeStorage()).load(),
    createEmptyMapping(),
  );
  const repository = createMidiMappingRepository(null);
  assert.equal(repository.available, false);
  assert.deepEqual(repository.load(), createEmptyMapping());
  assert.deepEqual(repository.save(fullMapping()), {
    ok: false,
    reason: "unavailable",
  });
});

Deno.test("corrupt or invalid stored data falls back and can be replaced", () => {
  const storage = createFakeStorage({ [MIDI_MAPPING_KEY]: "{not json" });
  const repository = createMidiMappingRepository(storage);
  assert.deepEqual(repository.load(), createEmptyMapping());
  assert.equal(repository.save(fullMapping()).ok, true);
  assert.equal(repository.load().forward.number, 36);

  storage.setItem(
    MIDI_MAPPING_KEY,
    JSON.stringify({
      version: 1,
      mappings: {
        forward: { kind: "note", channel: 99, number: 1 },
        stop: { kind: "cc", channel: 1, number: 7, extra: true },
      },
    }),
  );
  const loaded = repository.load();
  assert.equal(loaded.forward, null);
  assert.deepEqual(loaded.stop, { kind: "cc", channel: 1, number: 7 });
});

Deno.test("unversioned data is migrated and newer data is never overwritten", () => {
  const legacy = createFakeStorage({
    [MIDI_MAPPING_KEY]: JSON.stringify({
      forward: { kind: "note", channel: 0, number: 12 },
    }),
  });
  assert.equal(createMidiMappingRepository(legacy).load().forward.number, 12);

  const future = JSON.stringify({ version: 99, mappings: {}, extra: 1 });
  const storage = createFakeStorage({ [MIDI_MAPPING_KEY]: future });
  const repository = createMidiMappingRepository(storage);
  assert.deepEqual(repository.load(), createEmptyMapping());
  assert.deepEqual(repository.save(fullMapping()), {
    ok: false,
    reason: "future-version",
  });
  assert.equal(storage.getItem(MIDI_MAPPING_KEY), future);
});

Deno.test("write failures are reported without throwing", () => {
  const storage = createFakeStorage();
  storage.setItem = () => {
    throw new Error("quota");
  };
  assert.deepEqual(createMidiMappingRepository(storage).save(fullMapping()), {
    ok: false,
    reason: "write-failed",
  });
});

Deno.test("event log lines show seconds since the first event", () => {
  assert.equal(
    formatMidiActionEvent(
      { type: "scratch", direction: "forward", time: 1500 },
      1000,
    ),
    "+0.500s scratch forward",
  );
  assert.equal(
    formatMidiActionEvent({ type: "fader", state: "closed", time: 1000 }),
    "+0.000s fader closed",
  );
});
