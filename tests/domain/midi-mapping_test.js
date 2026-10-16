import assert from "node:assert/strict";
import {
  assignMapping,
  clearMapping,
  convertMidiMessage,
  createEmptyMapping,
  createEventCompressor,
  createMidiMappingRepository,
  createStopDetector,
  describeSignature,
  formatMidiActionEvent,
  getMidiSignature,
  MIDI_ACTIONS,
  MIDI_MAPPING_KEY,
  MidiMappingConflictError,
  routeMidiMessage,
  swapFaderDirection,
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

const sig = (data) => getMidiSignature(data);

function fullMapping() {
  let mapping = createEmptyMapping();
  mapping = assignMapping(mapping, "forward", sig(note(36, 100)));
  mapping = assignMapping(mapping, "backward", sig(note(37, 90)));
  mapping = assignMapping(mapping, "fader", {
    ...sig(cc(7, 64)),
    open: 0,
    threshold: 120,
    closed: 127,
  });
  return mapping;
}

Deno.test("signatures carry velocity and ignore note-off and system messages", () => {
  assert.deepEqual(sig(note(36, 100)), {
    kind: "note",
    channel: 0,
    number: 36,
    velocity: 100,
  });
  assert.deepEqual(sig(cc(7, 1, 3)), {
    kind: "cc",
    channel: 3,
    number: 7,
    velocity: 1,
  });
  // A resting fader sends CC value 0, which is a valid position.
  assert.equal(sig(cc(7, 0)).velocity, 0);
  assert.equal(sig(note(36, 0)), null);
  assert.equal(sig([0x80, 36, 64]), null);
  assert.equal(sig([0xf8]), null);
  assert.equal(sig(undefined), null);
});

Deno.test("forward and backward require one fixed velocity", () => {
  const mapping = fullMapping();
  assert.equal(mapping.forward.min, 100);
  assert.equal(mapping.forward.max, 100);
  assert.throws(() =>
    assignMapping(mapping, "forward", {
      ...sig(note(36, 100)),
      min: 1,
      max: 127,
    })
  );
  assert.equal(
    convertMidiMessage(note(36, 100), mapping, 1).direction,
    "forward",
  );
  assert.equal(convertMidiMessage(note(36, 99), mapping, 1), null);
  assert.equal(convertMidiMessage(note(36, 101), mapping, 1), null);
});

Deno.test("fader decides open, threshold and closed on one control", () => {
  const mapping = fullMapping();
  for (const value of [0, 60, 120]) {
    assert.deepEqual(convertMidiMessage(cc(7, value), mapping, 5), {
      type: "fader",
      state: "open",
      time: 5,
    });
  }
  for (const value of [121, 125, 127]) {
    assert.deepEqual(convertMidiMessage(cc(7, value), mapping, 6), {
      type: "fader",
      state: "closed",
      time: 6,
    });
  }
  assert.equal(convertMidiMessage(cc(8, 100), mapping, 0), null);
  assert.equal(convertMidiMessage(cc(7, 100, 2), mapping, 0), null);
});

Deno.test("Learn gives the default 0 / 120 / 127 fader", () => {
  const learned = assignMapping(createEmptyMapping(), "fader", sig(cc(7, 90)));
  assert.deepEqual(learned.fader, {
    kind: "cc",
    channel: 0,
    number: 7,
    open: 0,
    threshold: 120,
    closed: 127,
  });
  assert.equal(
    describeSignature(learned.fader),
    "CC 7 (ch 1) / 開 0 〜 閾値 120 〜 閉 127",
  );
});

Deno.test("a fader with the open end at the high value works the other way", () => {
  const mapping = assignMapping(createEmptyMapping(), "fader", {
    ...sig(cc(7, 0)),
    open: 127,
    threshold: 7,
    closed: 0,
  });
  assert.equal(convertMidiMessage(cc(7, 127), mapping, 0).state, "open");
  assert.equal(convertMidiMessage(cc(7, 7), mapping, 0).state, "open");
  assert.equal(convertMidiMessage(cc(7, 6), mapping, 0).state, "closed");
  assert.equal(convertMidiMessage(cc(7, 0), mapping, 0).state, "closed");
});

Deno.test("values outside the open and closed ends are ignored", () => {
  const mapping = assignMapping(createEmptyMapping(), "fader", {
    ...sig(cc(7, 0)),
    open: 10,
    threshold: 60,
    closed: 100,
  });
  assert.equal(convertMidiMessage(cc(7, 5), mapping, 0), null);
  assert.equal(convertMidiMessage(cc(7, 110), mapping, 0), null);
  assert.equal(convertMidiMessage(cc(7, 10), mapping, 0).state, "open");
  assert.equal(convertMidiMessage(cc(7, 100), mapping, 0).state, "closed");
});

Deno.test("invalid fader values are rejected", () => {
  const base = fullMapping().fader;
  for (
    const bad of [
      { threshold: 127 },
      { threshold: -1 },
      { open: 127, closed: 127 },
      { open: 0, threshold: 130 },
      { threshold: 1.5 },
      { open: 100, threshold: 120, closed: 0 },
    ]
  ) {
    assert.throws(() =>
      assignMapping(createEmptyMapping(), "fader", { ...base, ...bad })
    );
  }
});

Deno.test("swapping open and closed mirrors the threshold as 127 - threshold", () => {
  const swapped = swapFaderDirection(fullMapping().fader);
  assert.deepEqual(swapped, {
    kind: "cc",
    channel: 0,
    number: 7,
    open: 127,
    threshold: 7,
    closed: 0,
  });
  // The same physical position keeps its meaning after mirroring the value.
  const before = fullMapping();
  const after = assignMapping(createEmptyMapping(), "fader", swapped);
  for (const value of [0, 50, 120, 121, 127]) {
    assert.equal(
      convertMidiMessage(cc(7, 127 - value), after, 0).state,
      convertMidiMessage(cc(7, value), before, 0).state,
    );
  }
  assert.deepEqual(swapFaderDirection(swapped), fullMapping().fader);
});

Deno.test("swapping clamps the threshold into the open/closed span", () => {
  const swapped = swapFaderDirection({
    kind: "cc",
    channel: 0,
    number: 7,
    open: 0,
    threshold: 10,
    closed: 50,
  });
  assert.equal(swapped.open, 50);
  assert.equal(swapped.closed, 0);
  assert.equal(swapped.threshold, 50);
  assert.doesNotThrow(() =>
    assignMapping(createEmptyMapping(), "fader", swapped)
  );
});

Deno.test("an input already used by another action is rejected and nothing is unassigned", () => {
  const mapping = fullMapping();
  const snapshot = structuredClone(mapping);

  // Same control and velocity as Forward.
  assert.throws(
    () => assignMapping(mapping, "backward", sig(note(36, 100))),
    (error) =>
      error instanceof MidiMappingConflictError &&
      error.conflictAction === "forward",
  );
  // A velocity inside the fader's open-closed span on the fader's control.
  assert.throws(
    () => assignMapping(mapping, "forward", sig(cc(7, 100))),
    (error) =>
      error instanceof MidiMappingConflictError &&
      error.conflictAction === "fader",
  );
  // Learning a fader over Forward's control and velocity.
  assert.throws(
    () =>
      assignMapping(mapping, "fader", {
        ...sig(note(36, 100)),
        open: 0,
        threshold: 120,
        closed: 127,
      }),
    (error) => error.conflictAction === "forward",
  );
  assert.deepEqual(mapping, snapshot);
});

Deno.test("the same control with a different velocity or channel does not conflict", () => {
  const mapping = fullMapping();
  const other = assignMapping(mapping, "backward", sig(note(36, 99)));
  assert.equal(other.forward.min, 100);
  assert.equal(other.backward.min, 99);
  assert.notEqual(
    assignMapping(mapping, "backward", sig(note(36, 100, 1))),
    null,
  );
  assert.notEqual(assignMapping(mapping, "backward", sig(note(37, 100))), null);

  const split = assignMapping(
    assignMapping(createEmptyMapping(), "fader", {
      ...sig(cc(7, 0)),
      open: 64,
      threshold: 90,
      closed: 100,
    }),
    "forward",
    sig(cc(7, 20)),
  );
  assert.notEqual(split.fader, null);
  assert.equal(split.forward.min, 20);
});

Deno.test("re-learning an action replaces only its own assignment", () => {
  const mapping = fullMapping();
  const next = assignMapping(mapping, "forward", sig(note(36, 100)));
  assert.deepEqual(next, mapping);
  const moved = assignMapping(mapping, "forward", sig(note(50, 80)));
  assert.equal(moved.forward.number, 50);
  assert.deepEqual(moved.backward, mapping.backward);
  assert.deepEqual(moved.fader, mapping.fader);
});

Deno.test("fader edits that run into another action are rejected", () => {
  const fader = {
    ...sig(cc(7, 0)),
    open: 0,
    threshold: 20,
    closed: 60,
  };
  const mapping = assignMapping(
    assignMapping(createEmptyMapping(), "fader", fader),
    "backward",
    sig(cc(7, 100)),
  );
  assert.notEqual(mapping.fader, null);

  const widened = { ...mapping.fader, closed: 110 };
  assert.throws(
    () => assignMapping(mapping, "fader", widened),
    (error) => error.conflictAction === "backward",
  );
  assert.equal(mapping.fader.closed, 60);
  assert.equal(mapping.backward.min, 100);

  // Swapping keeps the same span, so it stays valid.
  assert.doesNotThrow(() =>
    assignMapping(mapping, "fader", swapFaderDirection(mapping.fader))
  );
});

Deno.test("clearing an action keeps the others", () => {
  assert.equal(clearMapping(fullMapping(), "forward").forward, null);
  assert.notEqual(clearMapping(fullMapping(), "forward").fader, null);
});

Deno.test("stop is not mappable and is never produced from a message", () => {
  assert.equal(MIDI_ACTIONS.includes("stop"), false);
  assert.equal(createEmptyMapping().stop, undefined);
  assert.equal(
    convertMidiMessage(note(36, 100), fullMapping(), 0).direction,
    "forward",
  );
});

function createFakeTimers() {
  let next = 1;
  const timers = new Map();
  return {
    setTimer: (fn, ms) => {
      timers.set(next, { fn, ms });
      return next++;
    },
    clearTimer: (id) => timers.delete(id),
    pending: () => timers.size,
    fire: () => {
      const [id, timer] = [...timers][0];
      timers.delete(id);
      timer.fn();
    },
  };
}

Deno.test("stop is detected when forward/backward input ceases", () => {
  const timers = createFakeTimers();
  const stops = [];
  const detector = createStopDetector({
    onStop: (event) => stops.push(event),
    timeoutMs: 150,
    ...timers,
  });

  detector.observe({ type: "fader", state: "open", time: 0 });
  assert.equal(timers.pending(), 0);

  detector.observe({ type: "scratch", direction: "forward", time: 1000 });
  detector.observe({ type: "scratch", direction: "backward", time: 1100 });
  assert.equal(timers.pending(), 1);
  assert.deepEqual(stops, []);

  timers.fire();
  assert.deepEqual(stops, [{ type: "scratch", direction: "stop", time: 1250 }]);
  assert.equal(timers.pending(), 0);
});

Deno.test("cancelling the stop detector prevents a stop event", () => {
  const timers = createFakeTimers();
  const stops = [];
  const detector = createStopDetector({
    onStop: (event) => stops.push(event),
    ...timers,
  });
  detector.observe({ type: "scratch", direction: "forward", time: 0 });
  detector.cancel();
  assert.equal(timers.pending(), 0);
  assert.deepEqual(stops, []);
});

Deno.test("learn mode captures the next usable message with its velocity", () => {
  const mapping = fullMapping();
  const context = { mapping, learnAction: "forward", time: 5 };

  assert.deepEqual(routeMidiMessage([0xf8], context), { kind: "ignored" });
  assert.deepEqual(routeMidiMessage([0x80, 50, 0], context), {
    kind: "ignored",
  });
  // Even a control that is already mapped is learned rather than triggered.
  assert.deepEqual(routeMidiMessage(note(36, 100), context), {
    kind: "learned",
    action: "forward",
    signature: { kind: "note", channel: 0, number: 36, velocity: 100 },
  });

  const learned = routeMidiMessage(note(50, 77, 2), context);
  const next = assignMapping(mapping, learned.action, learned.signature);
  assert.deepEqual(next.forward, {
    kind: "note",
    channel: 2,
    number: 50,
    min: 77,
    max: 77,
  });
  assert.deepEqual(
    routeMidiMessage(note(50, 77, 2), {
      mapping: next,
      learnAction: null,
      time: 9,
    }),
    {
      kind: "event",
      event: { type: "scratch", direction: "forward", time: 9 },
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

Deno.test("mappings with velocity conditions persist across instances", () => {
  const storage = createFakeStorage();
  const mapping = fullMapping();
  assert.deepEqual(createMidiMappingRepository(storage).save(mapping), {
    ok: true,
  });
  assert.deepEqual(createMidiMappingRepository(storage).load(), mapping);
  assert.equal(JSON.parse(storage.getItem(MIDI_MAPPING_KEY)).version, 4);
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
      version: 4,
      mappings: {
        forward: { kind: "note", channel: 99, number: 1, min: 1, max: 1 },
        backward: { kind: "note", channel: 0, number: 1, min: 9, max: 3 },
        fader: {
          kind: "cc",
          channel: 1,
          number: 7,
          open: 0,
          threshold: 5,
          closed: 127,
          x: 1,
        },
      },
    }),
  );
  const loaded = repository.load();
  assert.equal(loaded.forward, null);
  assert.equal(loaded.backward, null);
  assert.deepEqual(loaded.fader, {
    kind: "cc",
    channel: 1,
    number: 7,
    open: 0,
    threshold: 5,
    closed: 127,
  });
});

Deno.test("version 1 and unversioned data migrate without losing controls", () => {
  const v1 = createFakeStorage({
    [MIDI_MAPPING_KEY]: JSON.stringify({
      version: 1,
      mappings: {
        forward: { kind: "note", channel: 0, number: 12 },
        stop: { kind: "note", channel: 0, number: 13 },
      },
    }),
  });
  const migrated = createMidiMappingRepository(v1).load();
  // Old mappings matched every non-zero velocity; that is preserved.
  assert.deepEqual(migrated.forward, {
    kind: "note",
    channel: 0,
    number: 12,
    min: 1,
    max: 127,
  });
  assert.equal(migrated.stop, undefined);

  const v0 = createFakeStorage({
    [MIDI_MAPPING_KEY]: JSON.stringify({
      backward: { kind: "cc", channel: 2, number: 5 },
    }),
  });
  assert.equal(createMidiMappingRepository(v0).load().backward.max, 127);
});

Deno.test("version 2 separate faders migrate into one fader mapping", () => {
  const stored = (mappings, version = 2) =>
    createFakeStorage({
      [MIDI_MAPPING_KEY]: JSON.stringify({ version, mappings }),
    });
  const control = { kind: "cc", channel: 0, number: 7 };

  const both = createMidiMappingRepository(stored({
    forward: { kind: "note", channel: 0, number: 36, min: 100, max: 100 },
    "fader-open": { ...control, min: 70, max: 127 },
    "fader-close": { ...control, min: 0, max: 30 },
  })).load();
  assert.deepEqual(both.fader, {
    ...control,
    open: 127,
    threshold: 70,
    closed: 0,
  });
  assert.equal(both.forward.min, 100);

  const onlyOpen = createMidiMappingRepository(stored({
    "fader-open": { ...control, min: 64, max: 127 },
  })).load();
  assert.deepEqual(onlyOpen.fader, {
    ...control,
    open: 127,
    threshold: 64,
    closed: 0,
  });

  const onlyClose = createMidiMappingRepository(stored({
    "fader-close": { ...control, min: 0, max: 40 },
  })).load();
  assert.deepEqual(onlyClose.fader, {
    ...control,
    open: 127,
    threshold: 41,
    closed: 0,
  });

  const otherControl = createMidiMappingRepository(stored({
    "fader-open": { ...control, min: 64, max: 127 },
    "fader-close": { ...control, number: 8, min: 0, max: 63 },
  })).load();
  assert.equal(otherControl.fader.number, 7);
  assert.equal(otherControl["fader-open"], undefined);
});

Deno.test("version 3 fader ranges migrate to open, threshold and closed", () => {
  const control = { kind: "cc", channel: 0, number: 7 };
  const load = (fader) =>
    createMidiMappingRepository(
      createFakeStorage({
        [MIDI_MAPPING_KEY]: JSON.stringify({ version: 3, mappings: { fader } }),
      }),
    ).load().fader;

  assert.deepEqual(
    load({
      ...control,
      open: { min: 64, max: 127 },
      closed: { min: 0, max: 63 },
    }),
    { ...control, open: 127, threshold: 64, closed: 0 },
  );
  assert.deepEqual(
    load({
      ...control,
      open: { min: 0, max: 20 },
      closed: { min: 50, max: 127 },
    }),
    { ...control, open: 0, threshold: 20, closed: 127 },
  );
  assert.equal(
    load({
      ...control,
      open: { min: 0, max: 80 },
      closed: { min: 60, max: 127 },
    }),
    null,
  );
});

Deno.test("newer data is never overwritten and write failures are reported", () => {
  const future = JSON.stringify({ version: 99, mappings: {}, extra: 1 });
  const storage = createFakeStorage({ [MIDI_MAPPING_KEY]: future });
  const repository = createMidiMappingRepository(storage);
  assert.deepEqual(repository.load(), createEmptyMapping());
  assert.deepEqual(repository.save(fullMapping()), {
    ok: false,
    reason: "future-version",
  });
  assert.equal(storage.getItem(MIDI_MAPPING_KEY), future);

  const failing = createFakeStorage();
  failing.setItem = () => {
    throw new Error("quota");
  };
  assert.deepEqual(createMidiMappingRepository(failing).save(fullMapping()), {
    ok: false,
    reason: "write-failed",
  });
});

Deno.test("signature descriptions show velocity", () => {
  const mapping = fullMapping();
  assert.equal(
    describeSignature(mapping.forward),
    "Note 36 (ch 1) / ベロシティ 100",
  );
  assert.equal(
    describeSignature(mapping.fader),
    "CC 7 (ch 1) / 開 0 〜 閾値 120 〜 閉 127",
  );
  assert.equal(describeSignature(null), "未割り当て");
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
    formatMidiActionEvent({ type: "scratch", direction: "stop", time: 1000 }),
    "+0.000s scratch stop",
  );
});

const scratchEvent = (direction, time = 0) => ({
  type: "scratch",
  direction,
  time,
});
const faderEvent = (state, time = 0) => ({ type: "fader", state, time });
const compress = (events) => {
  const compressor = createEventCompressor();
  return events.map((event) => compressor.accept(event)).filter(Boolean);
};
const summary = (events) => events.map((e) => e.direction ?? e.state);

Deno.test("consecutive identical scratch directions collapse into one event", () => {
  const events = [
    "forward",
    "forward",
    "forward",
    "forward",
    "backward",
    "backward",
  ]
    .map((direction, index) => scratchEvent(direction, index));
  assert.deepEqual(summary(compress(events)), ["forward", "backward"]);
});

Deno.test("the first event of each kind is always kept with its timestamp", () => {
  const kept = compress([
    scratchEvent("forward", 5),
    scratchEvent("forward", 6),
  ]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].time, 5);
});

Deno.test("a stop separates strokes, so the same direction is kept again", () => {
  const kept = compress([
    scratchEvent("forward"),
    scratchEvent("forward"),
    scratchEvent("stop"),
    scratchEvent("forward"),
  ]);
  assert.deepEqual(summary(kept), ["forward", "stop", "forward"]);
});

Deno.test("fader movement collapses to state changes, independent of scratch", () => {
  const kept = compress([
    faderEvent("open"),
    scratchEvent("forward"),
    faderEvent("open"),
    faderEvent("closed"),
    scratchEvent("forward"),
    faderEvent("closed"),
    faderEvent("open"),
  ]);
  assert.deepEqual(summary(kept), ["open", "forward", "closed", "open"]);
});

Deno.test("reset forgets the previous direction", () => {
  const compressor = createEventCompressor();
  assert.ok(compressor.accept(scratchEvent("forward")));
  assert.equal(compressor.accept(scratchEvent("forward")), null);
  compressor.reset();
  assert.ok(compressor.accept(scratchEvent("forward")));
});

Deno.test("a 800-message stroke stream becomes one event per stroke", () => {
  const mapping = assignMapping(
    assignMapping(
      createEmptyMapping(),
      "forward",
      getMidiSignature([0x90, 36, 100]),
    ),
    "backward",
    getMidiSignature([0x90, 36, 20]),
  );
  const compressor = createEventCompressor();
  const timers = [];
  const detector = createStopDetector({
    onStop: (event) => {
      const kept = compressor.accept(event);
      if (kept) recorded.push(kept);
    },
    setTimer: (fn) => timers.push(fn) - 1,
    clearTimer: (id) => (timers[id] = () => {}),
  });
  const recorded = [];
  let raw = 0;
  let time = 0;
  for (let stroke = 0; stroke < 16; stroke += 1) {
    const velocity = stroke % 2 === 0 ? 100 : 20;
    for (let i = 0; i < 50; i += 1) {
      time += 2;
      const event = convertMidiMessage([0x90, 36, velocity], mapping, time);
      raw += 1;
      detector.observe(event);
      const kept = compressor.accept(event);
      if (kept) recorded.push(kept);
    }
  }
  detector.flush(time + 1000);
  assert.equal(raw, 800);
  assert.deepEqual(summary(recorded), [
    ...Array.from({ length: 8 }, () => ["forward", "backward"]).flat(),
    "stop",
  ]);
});
