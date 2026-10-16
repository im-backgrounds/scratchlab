import assert from "node:assert/strict";
import { chartCatalog } from "../../src/data/chart-catalog.js";
import { compileScoreData } from "../../src/domain/score-compiler.js";
import {
  analyzePerformance,
  analyzePerformanceLoops,
  createExpectedEvents,
  getEventKind,
} from "../../src/domain/performance-analysis.js";
import { createStopDetector } from "../../src/domain/midi-mapping.js";

const compile = (score, beat = "4/4") =>
  compileScoreData({ name: "t", beat, score });
const scratch = (direction) => ({ type: "scratch", direction });
const fader = (state) => ({ type: "fader", state });
const kinds = (events) => events.map(getEventKind);

Deno.test("plain strokes become scratch events followed by a stop", () => {
  const expected = createExpectedEvents(compile([["F", "B", "F", "B"]]));
  assert.deepEqual(kinds(expected), [
    "forward",
    "backward",
    "forward",
    "backward",
    "stop",
  ]);
});

Deno.test("mute and open modifiers become fader events only on change", () => {
  // BM closes the fader, FO opens it again, a second FO changes nothing
  const expected = createExpectedEvents(
    compile([["F", "BM", "FO", "BM", "FO", "FO"]], "6/8"),
  );
  assert.deepEqual(kinds(expected), [
    "forward",
    "faderClosed",
    "backward",
    "faderOpen",
    "forward",
    "faderClosed",
    "backward",
    "faderOpen",
    "forward",
    "forward",
    "stop",
  ]);
});

Deno.test("a cut closes and reopens the fader after its stroke", () => {
  const expected = createExpectedEvents(compile([["FC", "B"]]));
  assert.deepEqual(kinds(expected), [
    "forward",
    "faderClosed",
    "faderOpen",
    "backward",
    "stop",
  ]);
});

Deno.test("repeated tokens expand and keep cells add nothing", () => {
  assert.deepEqual(
    kinds(createExpectedEvents(compile([["F2", "B"]]))),
    ["forward", "forward", "backward", "stop"],
  );
  assert.deepEqual(
    kinds(createExpectedEvents(compile([["F", "K", "B", "K"]]))),
    ["forward", "backward", "stop"],
  );
});

Deno.test("every catalog chart yields expected events", () => {
  for (const chart of chartCatalog) {
    const expected = createExpectedEvents(compileScoreData(chart));
    assert.ok(expected.length > 1, chart.name);
    assert.equal(getEventKind(expected.at(-1)), "stop", chart.name);
    assert.ok(expected.every((event) => getEventKind(event)), chart.name);
  }
});

Deno.test("an identical sequence is a perfect match", () => {
  const expected = [scratch("forward"), fader("closed"), scratch("stop")];
  const result = analyzePerformance(expected, [...expected]);
  assert.equal(result.matched, 3);
  assert.equal(result.missing, 0);
  assert.equal(result.extra, 0);
  assert.equal(result.accuracy, 100);
});

Deno.test("missing and extra events are counted per kind", () => {
  const expected = [
    scratch("forward"),
    scratch("backward"),
    scratch("forward"),
    scratch("stop"),
  ];
  const actual = [
    scratch("forward"),
    scratch("forward"),
    scratch("stop"),
    scratch("stop"),
  ];
  const result = analyzePerformance(expected, actual);
  assert.equal(result.matched, 3);
  assert.equal(result.missing, 1);
  assert.equal(result.extra, 1);
  assert.equal(result.expectedCount, 4);
  assert.equal(result.actualCount, 4);
  assert.deepEqual(result.byKind.backward, {
    matched: 0,
    missing: 1,
    extra: 0,
  });
  assert.deepEqual(result.byKind.stop, { matched: 1, missing: 0, extra: 1 });
  assert.equal(result.accuracy, 60);
});

Deno.test("a missing performance scores zero and an empty one is null", () => {
  const expected = [scratch("forward"), scratch("stop")];
  const none = analyzePerformance(expected, []);
  assert.equal(none.missing, 2);
  assert.equal(none.accuracy, 0);
  assert.equal(analyzePerformance([], []).accuracy, null);
  assert.equal(analyzePerformance([], [scratch("forward")]).accuracy, 0);
});

Deno.test("scratch and fader lanes are aligned independently", () => {
  const expected = [fader("closed"), scratch("forward"), fader("open")];
  const actual = [scratch("forward"), fader("closed"), fader("open")];
  const result = analyzePerformance(expected, actual);
  assert.equal(result.matched, 3);
  assert.equal(result.accuracy, 100);
});

Deno.test("order inside a lane matters and timing is ignored", () => {
  const swapped = analyzePerformance(
    [scratch("forward"), scratch("backward")],
    [scratch("backward"), scratch("forward")],
  );
  assert.equal(swapped.matched, 1);
  assert.equal(swapped.missing, 1);
  assert.equal(swapped.extra, 1);

  const late = analyzePerformance(
    [scratch("forward")],
    [{ ...scratch("forward"), t: 99999 }],
  );
  assert.equal(late.accuracy, 100);
});

Deno.test("unknown events are ignored", () => {
  const result = analyzePerformance(
    [scratch("forward")],
    [null, { type: "other" }, scratch("forward")],
  );
  assert.equal(result.accuracy, 100);
  assert.equal(getEventKind({ type: "scratch", direction: "x" }), null);
});

Deno.test("a chart played exactly as written scores 100%", () => {
  for (const chart of chartCatalog) {
    const expected = createExpectedEvents(compileScoreData(chart));
    assert.equal(analyzePerformance(expected, expected).accuracy, 100);
  }
});

Deno.test("flush emits the pending stop immediately and only once", () => {
  const stops = [];
  let scheduled = null;
  const detector = createStopDetector({
    onStop: (event) => stops.push(event),
    timeoutMs: 150,
    setTimer: (fn) => (scheduled = fn),
    clearTimer: () => (scheduled = null),
  });
  detector.flush(1000);
  assert.equal(stops.length, 0);

  detector.observe({ type: "scratch", direction: "forward", time: 500 });
  detector.flush(1000);
  assert.deepEqual(stops, [{ type: "scratch", direction: "stop", time: 650 }]);
  assert.equal(scheduled, null);
  detector.flush(1000);
  assert.equal(stops.length, 1);

  detector.observe({ type: "scratch", direction: "forward", time: 900 });
  detector.flush(950);
  assert.equal(stops[1].time, 950);
});

Deno.test("loops are analyzed separately and the tallies are added up", () => {
  const expected = createExpectedEvents(compile([["F", "B"]]));
  const at = (t, direction) => ({ t, ...scratch(direction) });
  // Loop 1 is perfect; loop 2 misses the backward stroke.
  const events = [
    at(0, "forward"),
    at(100, "backward"),
    at(200, "stop"),
    at(300, "forward"),
    at(400, "stop"),
  ];
  const result = analyzePerformanceLoops(expected, events, [200]);
  assert.equal(result.matched, 5);
  assert.equal(result.missing, 1);
  assert.equal(result.extra, 0);
  assert.equal(result.accuracy, 83.3);
});

Deno.test("an event at a loop end belongs to the loop that ends there", () => {
  const expected = createExpectedEvents(compile([["F"]]));
  const events = [
    { t: 10, ...scratch("forward") },
    { t: 100, ...scratch("stop") },
    { t: 110, ...scratch("forward") },
    { t: 200, ...scratch("stop") },
  ];
  assert.equal(analyzePerformanceLoops(expected, events, [100]).accuracy, 100);
  // Without boundaries the same events count as one long loop with extras.
  assert.ok(analyzePerformanceLoops(expected, events).accuracy < 100);
});
