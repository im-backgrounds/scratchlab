import assert from "node:assert/strict";
import {
  buildTimeline,
  COUNT_KEYS,
  countPerformanceEvents,
  createEmptyCounts,
  createPerformance,
  createPerformanceFilename,
  createPerformanceRepository,
  formatDuration,
  MAX_PERFORMANCE_EVENTS,
  normalizePerformance,
  PERFORMANCE_STORAGE_KEY,
  serializePerformance,
} from "../../src/domain/performance.js";

const START = Date.UTC(2026, 9, 16, 14, 0, 0);

function createFakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

const scratch = (direction, offset) => ({
  type: "scratch",
  direction,
  time: START + offset,
});
const fader = (state, offset) => ({
  type: "fader",
  state,
  time: START + offset,
});

function samplePerformance() {
  return createPerformance(
    [
      scratch("forward", 100),
      fader("open", 150),
      scratch("backward", 400),
      fader("closed", 500),
      scratch("stop", 700),
    ],
    { startedAt: START, endedAt: START + 1000 },
  );
}

Deno.test("a performance stores event times relative to the start", () => {
  const performance = samplePerformance();
  assert.equal(performance.format, "scratchlab-performance");
  assert.equal(performance.version, 1);
  assert.equal(performance.startedAt, "2026-10-16T14:00:00.000Z");
  assert.deepEqual(performance.events, [
    { t: 100, type: "scratch", direction: "forward" },
    { t: 150, type: "fader", state: "open" },
    { t: 400, type: "scratch", direction: "backward" },
    { t: 500, type: "fader", state: "closed" },
    { t: 700, type: "scratch", direction: "stop" },
  ]);
  assert.equal(performance.durationMs, 1000);
  assert.equal(performance.truncated, false);
});

Deno.test("counts cover forward, backward, stop, fader open and close", () => {
  assert.deepEqual(samplePerformance().counts, {
    forward: 1,
    backward: 1,
    stop: 1,
    faderOpen: 1,
    faderClosed: 1,
  });
  const repeated = countPerformanceEvents([
    { t: 0, type: "scratch", direction: "forward" },
    { t: 1, type: "scratch", direction: "forward" },
    { t: 2, type: "fader", state: "closed" },
    { t: 3, type: "bogus" },
  ]);
  assert.equal(repeated.forward, 2);
  assert.equal(repeated.faderClosed, 1);
  assert.equal(repeated.stop, 0);
  assert.deepEqual(Object.keys(createEmptyCounts()), COUNT_KEYS);
});

Deno.test("events are sorted and invalid ones dropped", () => {
  const performance = createPerformance(
    [
      scratch("backward", 300),
      scratch("forward", 100),
      { type: "scratch", direction: "sideways", time: START + 50 },
      { type: "other", time: START + 60 },
      null,
    ],
    { startedAt: START, endedAt: START + 500 },
  );
  assert.deepEqual(performance.events.map((event) => event.direction), [
    "forward",
    "backward",
  ]);
});

Deno.test("duration covers the last event even if it came after the end", () => {
  const performance = createPerformance([scratch("stop", 1150)], {
    startedAt: START,
    endedAt: START + 1000,
  });
  assert.equal(performance.durationMs, 1150);
  const empty = createPerformance([], { startedAt: START, endedAt: START });
  assert.equal(empty.durationMs, 0);
  assert.deepEqual(empty.events, []);
  assert.equal(empty.counts.forward, 0);
});

Deno.test("events before the start are clamped to zero", () => {
  const performance = createPerformance([scratch("forward", -50)], {
    startedAt: START,
    endedAt: START + 100,
  });
  assert.equal(performance.events[0].t, 0);
});

Deno.test("a performance is capped and flagged as truncated", () => {
  const events = Array.from(
    { length: MAX_PERFORMANCE_EVENTS + 10 },
    (_, index) => scratch("forward", index),
  );
  const performance = createPerformance(events, {
    startedAt: START,
    endedAt: START + 10000,
  });
  assert.equal(performance.events.length, MAX_PERFORMANCE_EVENTS);
  assert.equal(performance.truncated, true);
  assert.equal(performance.counts.forward, MAX_PERFORMANCE_EVENTS);
});

Deno.test("exported JSON round-trips through normalizePerformance", () => {
  const performance = samplePerformance();
  const json = serializePerformance(performance);
  assert.deepEqual(normalizePerformance(JSON.parse(json)), performance);
  assert.deepEqual(Object.keys(JSON.parse(json)), [
    "format",
    "version",
    "startedAt",
    "durationMs",
    "counts",
    "truncated",
    "events",
  ]);
});

Deno.test("normalizePerformance rejects unusable data and recomputes counts", () => {
  assert.equal(normalizePerformance(null), null);
  assert.equal(normalizePerformance([]), null);
  assert.equal(normalizePerformance({ format: "other", events: [] }), null);
  assert.equal(
    normalizePerformance({
      format: "scratchlab-performance",
      startedAt: "not a date",
      events: [],
    }),
    null,
  );
  assert.equal(
    normalizePerformance({
      format: "scratchlab-performance",
      startedAt: "2026-10-16T14:00:00.000Z",
      events: "nope",
    }),
    null,
  );

  const tampered = { ...samplePerformance(), counts: { forward: 99 } };
  assert.equal(normalizePerformance(tampered).counts.forward, 1);
});

Deno.test("the timeline has scratch and fader lanes that fill to the end", () => {
  const timeline = buildTimeline(samplePerformance());
  assert.equal(timeline.durationMs, 1000);
  assert.deepEqual(timeline.lanes.map((lane) => lane.id), ["scratch", "fader"]);

  const [scratchLane, faderLane] = timeline.lanes;
  assert.deepEqual(
    scratchLane.segments.map((segment) => segment.kind),
    ["forward", "backward", "stop"],
  );
  assert.deepEqual(scratchLane.segments[0], {
    kind: "forward",
    startMs: 100,
    endMs: 400,
    left: 10,
    width: 30,
  });
  const last = scratchLane.segments[2];
  assert.equal(last.endMs, 1000);
  assert.equal(last.left + last.width, 100);

  assert.deepEqual(
    faderLane.segments.map((
      segment,
    ) => [segment.kind, segment.left, segment.width]),
    [["open", 15, 35], ["closed", 50, 50]],
  );
});

Deno.test("the timeline of an empty performance has no segments", () => {
  const timeline = buildTimeline(
    createPerformance([], { startedAt: START, endedAt: START }),
  );
  assert.equal(
    timeline.lanes.every((lane) => lane.segments.length === 0),
    true,
  );
});

Deno.test("durations and filenames are formatted for display and export", () => {
  assert.equal(formatDuration(0), "0:00.000");
  assert.equal(formatDuration(65432), "1:05.432");
  assert.equal(formatDuration(-5), "0:00.000");
  assert.equal(
    createPerformanceFilename(samplePerformance()),
    "scratchlab-performance-2026-10-16T14-00-00Z.json",
  );
});

Deno.test("the latest performance persists across repository instances", () => {
  const storage = createFakeStorage();
  const performance = samplePerformance();
  assert.deepEqual(createPerformanceRepository(storage).save(performance), {
    ok: true,
  });
  assert.deepEqual(createPerformanceRepository(storage).load(), performance);
  assert.equal(JSON.parse(storage.getItem(PERFORMANCE_STORAGE_KEY)).version, 1);

  const newer = createPerformance([scratch("forward", 10)], {
    startedAt: START + 5000,
    endedAt: START + 6000,
  });
  createPerformanceRepository(storage).save(newer);
  assert.deepEqual(createPerformanceRepository(storage).load(), newer);
});

Deno.test("an empty or unavailable storage loads no performance", () => {
  assert.equal(createPerformanceRepository(createFakeStorage()).load(), null);
  const repository = createPerformanceRepository(null);
  assert.equal(repository.available, false);
  assert.equal(repository.load(), null);
  assert.deepEqual(repository.save(samplePerformance()), {
    ok: false,
    reason: "unavailable",
  });
});

Deno.test("corrupt stored data loads as nothing and can be replaced", () => {
  for (const text of ["{not json", "[]", JSON.stringify({ version: 1 })]) {
    const storage = createFakeStorage({ [PERFORMANCE_STORAGE_KEY]: text });
    const repository = createPerformanceRepository(storage);
    assert.equal(repository.load(), null);
    assert.equal(repository.save(samplePerformance()).ok, true);
    assert.notEqual(repository.load(), null);
  }
});

Deno.test("newer data is never overwritten, and invalid or failing writes are reported", () => {
  const future = JSON.stringify({ version: 9, performance: {} });
  const storage = createFakeStorage({ [PERFORMANCE_STORAGE_KEY]: future });
  const repository = createPerformanceRepository(storage);
  assert.equal(repository.load(), null);
  assert.deepEqual(repository.save(samplePerformance()), {
    ok: false,
    reason: "future-version",
  });
  assert.deepEqual(repository.clear(), { ok: false, reason: "future-version" });
  assert.equal(storage.getItem(PERFORMANCE_STORAGE_KEY), future);

  assert.deepEqual(
    createPerformanceRepository(createFakeStorage()).save({ nope: true }),
    { ok: false, reason: "invalid" },
  );

  const failing = createFakeStorage();
  failing.setItem = () => {
    throw new Error("quota");
  };
  assert.deepEqual(
    createPerformanceRepository(failing).save(samplePerformance()),
    { ok: false, reason: "write-failed" },
  );
});

Deno.test("clear removes the stored performance", () => {
  const storage = createFakeStorage();
  const repository = createPerformanceRepository(storage);
  repository.save(samplePerformance());
  assert.deepEqual(repository.clear(), { ok: true });
  assert.equal(repository.load(), null);
});

Deno.test("loop ends are stored and normalized only when present", () => {
  const events = [{ type: "scratch", direction: "forward", time: 1100 }];
  const plain = createPerformance(events, { startedAt: 1000, endedAt: 2000 });
  assert.equal("loopEnds" in plain, false);

  const looped = createPerformance(events, {
    startedAt: 1000,
    endedAt: 3000,
    loopEnds: [1000, -5, Number.NaN, 1000],
  });
  assert.deepEqual(looped.loopEnds, [1000]);
  assert.deepEqual(normalizePerformance(looped).loopEnds, [1000]);
  assert.equal(
    "loopEnds" in normalizePerformance({ ...looped, loopEnds: "x" }),
    false,
  );
});
