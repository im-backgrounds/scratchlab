import assert from "node:assert/strict";
import { chartCatalog } from "../../src/data/chart-catalog.js";
import { compileScoreData } from "../../src/domain/score-compiler.js";
import {
  analyzePerformance,
  analyzePerformanceLoops,
  analyzePerformanceTiming,
  createExpectedEvents,
  createExpectedTimeline,
  getEventKind,
} from "../../src/domain/performance-analysis.js";
import {
  createEventCompressor,
  createStopDetector,
} from "../../src/domain/midi-mapping.js";

const compile = (score, beat = "4/4") =>
  compileScoreData({ name: "t", beat, score });
const scratch = (direction) => ({ type: "scratch", direction });
const fader = (state) => ({ type: "fader", state });
const kinds = (events) => events.map(getEventKind);

Deno.test("v2 timeline merges same-direction strokes and preserves flare cuts", () => {
  assert.deepEqual(createExpectedTimeline(compile([["F", "F"]])), [
    { ...scratch("forward"), tick: 0 },
  ]);
  assert.deepEqual(createExpectedTimeline(compile([["F", "FF"]])), [
    { ...scratch("forward"), tick: 0 },
    { ...fader("closed"), tick: 6 },
    { ...fader("open"), tick: 6 },
  ]);
  assert.deepEqual(createExpectedTimeline(compile([["B", "BF"]])), [
    { ...scratch("backward"), tick: 0 },
    { ...fader("closed"), tick: 6 },
    { ...fader("open"), tick: 6 },
  ]);
});

Deno.test("v2 timeline keeps all three FC3 cuts with one forward stroke", () => {
  assert.deepEqual(createExpectedTimeline(compile([["FC3"]])), [
    { ...scratch("forward"), tick: 0 },
    ...[4, 12, 20].flatMap((tick) => [
      { ...fader("closed"), tick },
      { ...fader("open"), tick },
    ]),
  ]);
});

Deno.test("v2 timeline tracks fader changes independently of muted direction", () => {
  assert.deepEqual(
    createExpectedTimeline(compile([["FM", "FM", "BO", "BO"]])),
    [
      { ...fader("closed"), tick: 0 },
      { ...scratch("forward"), tick: 0 },
      { ...fader("open"), tick: 4 },
      { ...scratch("backward"), tick: 4 },
    ],
  );
});

Deno.test("v2 timeline does not reset direction at K or bar boundaries", () => {
  assert.deepEqual(
    createExpectedTimeline(compile([["F", "K"], ["K", "F"]])),
    [{ ...scratch("forward"), tick: 0 }],
  );
  assert.deepEqual(
    createExpectedTimeline(compile([["K", "B", "K", "F"]])),
    [
      { ...scratch("backward"), tick: 2 },
      { ...scratch("forward"), tick: 6 },
    ],
  );
  assert.deepEqual(createExpectedTimeline(compile([["K", "K"]])), []);
});

for (
  const fixture of [
    {
      id: "baby-scratch",
      directionTicks: [0, 2, 4, 6, 8, 10, 12, 14],
      cutTicks: [],
      count: 8,
    },
    {
      id: "chirp-scratch",
      directionTicks: [0, 6, 12, 15, 21, 24, 30, 36, 39, 42],
      cutTicks: [
        3.5,
        4.5,
        5.5,
        9.5,
        10.5,
        11.5,
        18.5,
        19.5,
        20.5,
        27.5,
        28.5,
        29.5,
        33.5,
        34.5,
        35.5,
        45.5,
        46.5,
        47.5,
      ],
      count: 46,
    },
    {
      id: "one-click-flare-orbit",
      directionTicks: [0, 2, 4, 6, 8, 10, 12, 14],
      cutTicks: [1.5, 3.5, 5.5, 7.5, 9.5, 11.5, 13.5, 15.5],
      count: 24,
    },
  ]
) {
  Deno.test(`v2 timeline regenerates ${fixture.id} meaning events and ticks`, () => {
    const chart = chartCatalog.find((chart) => chart.id === fixture.id);
    assert.ok(chart);
    const expected = [
      ...fixture.directionTicks.map((tick, index) => ({
        ...scratch(index % 2 === 0 ? "forward" : "backward"),
        tick,
      })),
      ...fixture.cutTicks.flatMap((tick) => [
        { ...fader("closed"), tick },
        { ...fader("open"), tick },
      ]),
    ].sort((a, b) => a.tick - b.tick);
    const score = compileScoreData(chart);
    const before = structuredClone(score);
    const timeline = createExpectedTimeline(score);
    assert.deepEqual(timeline, expected);
    assert.equal(timeline.length, fixture.count);
    assert.deepEqual(score, before);
    assert.deepEqual(createExpectedTimeline(score), timeline);
  });
}

Deno.test("v2 timelines contain only meaning events within every catalog score", () => {
  for (const chart of chartCatalog) {
    const score = compileScoreData(chart);
    const timeline = createExpectedTimeline(score);
    let direction = null;
    let faderState = "open";
    let previousTick = 0;
    for (const event of timeline) {
      assert.ok(Number.isFinite(event.tick));
      assert.ok(event.tick >= previousTick && event.tick < score.totalTicks);
      assert.ok(
        ["forward", "backward", "faderOpen", "faderClosed"].includes(
          getEventKind(event),
        ),
      );
      if (event.type === "scratch") {
        assert.notEqual(event.direction, direction);
        direction = event.direction;
      } else {
        assert.notEqual(event.state, faderState);
        faderState = event.state;
      }
      previousTick = event.tick;
    }
  }
});

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

// V1 characterization: these fixtures bypass expected-event generation.
// V2 must score the same continuous strokes and cuts at 100%.
for (
  const fixture of [
    {
      id: "chirp-scratch",
      groups: [
        ["forward", 0],
        ["forward", 3],
        ["backward", 0],
        ["backward", 3],
        ["forward", 0],
        ["backward", 0],
        ["backward", 3],
        ["forward", 0],
        ["backward", 0],
        ["backward", 3],
        ["forward", 0],
        ["forward", 3],
        ["backward", 0],
        ["forward", 0],
        ["backward", 0],
        ["backward", 3],
      ],
      expectedCount: 65,
      recordedCount: 47,
      missingForward: 6,
      missingBackward: 12,
      accuracy: 72.3,
    },
    {
      id: "one-click-flare-orbit",
      groups: Array.from(
        { length: 4 },
        () => [
          ["forward", 0],
          ["forward", 1],
          ["backward", 0],
          ["backward", 1],
        ],
      ).flat(),
      expectedCount: 33,
      recordedCount: 25,
      missingForward: 4,
      missingBackward: 4,
      accuracy: 75.8,
    },
  ]
) {
  Deno.test(`v1 regression: ${fixture.id} ideal input loses strokes before analysis`, () => {
    const chart = chartCatalog.find((chart) => chart.id === fixture.id);
    assert.ok(chart);
    const expected = createExpectedEvents(compileScoreData(chart));
    const input = fixture.groups.flatMap(([direction, cuts]) =>
      Array.from(
        { length: Math.max(1, Number(cuts)) },
        () => [
          scratch(direction),
          ...(cuts ? [fader("closed"), fader("open")] : []),
        ],
      ).flat()
    );
    input.push(scratch("stop"));
    assert.deepEqual(kinds(input), kinds(expected));

    const compressor = createEventCompressor();
    const recorded = input.map((event) => compressor.accept(event))
      .filter(Boolean);
    const analysis = analyzePerformance(expected, recorded);
    assert.equal(analysis.expectedCount, fixture.expectedCount);
    assert.equal(analysis.actualCount, fixture.recordedCount);
    assert.equal(analysis.matched, fixture.recordedCount);
    assert.equal(
      analysis.missing,
      fixture.missingForward + fixture.missingBackward,
    );
    assert.equal(analysis.extra, 0);
    assert.equal(analysis.byKind.forward.missing, fixture.missingForward);
    assert.equal(analysis.byKind.backward.missing, fixture.missingBackward);
    assert.equal(analysis.byKind.faderOpen.missing, 0);
    assert.equal(analysis.byKind.faderClosed.missing, 0);
    assert.equal(analysis.accuracy, fixture.accuracy);

    const twoLoops = [0, 1000].flatMap((offset) =>
      recorded.map((event, index) => ({ ...event, t: offset + index + 1 }))
    );
    const loops = analyzePerformanceLoops(expected, twoLoops, [1000]);
    assert.equal(loops.matched, analysis.matched * 2);
    assert.equal(loops.missing, analysis.missing * 2);
    assert.equal(loops.extra, 0);
    assert.equal(loops.accuracy, fixture.accuracy);
  });
}

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

Deno.test("timing analysis measures absolute error for existing sequence matches", () => {
  const score = compile([["F", "B"]]);
  const result = analyzePerformanceTiming(
    score,
    [
      { t: 10, ...scratch("forward") },
      { t: 1020, ...scratch("backward") },
      { t: 2040, ...scratch("stop") },
      { t: 1500, ...scratch("forward") },
    ],
    [],
    120,
  );
  assert.equal(result.matchedCount, 3);
  assert.ok(Math.abs(result.averageErrorMs - (70 / 3)) < 0.0001);
  assert.equal(result.maxErrorMs, 40);
  assert.equal(result.timingAccuracy, 76.7);
});

Deno.test("timing analysis maps each recording loop independently", () => {
  const score = compile([["F", "B"]]);
  const result = analyzePerformanceTiming(
    score,
    [
      { t: 10, ...scratch("forward") },
      { t: 1020, ...scratch("backward") },
      { t: 2000, ...scratch("stop") },
      { t: 2010, ...scratch("forward") },
      { t: 3020, ...scratch("backward") },
      { t: 4040, ...scratch("stop") },
    ],
    [2000],
    120,
  );
  assert.equal(result.matchedCount, 6);
  assert.ok(Math.abs(result.averageErrorMs - (100 / 6)) < 0.0001);
  assert.equal(result.maxErrorMs, 40);
  assert.equal(result.timingAccuracy, 83.3);
});

Deno.test("timing analysis excludes unmatched events and reports unavailable without pairs", () => {
  const score = compile([["F"]]);
  const matched = analyzePerformanceTiming(
    score,
    [
      { t: 10, ...scratch("forward") },
      { t: 50, ...scratch("backward") },
    ],
    [],
    120,
  );
  assert.equal(matched.matchedCount, 1);
  assert.equal(matched.averageErrorMs, 10);
  assert.equal(matched.maxErrorMs, 10);
  assert.equal(matched.timingAccuracy, 90);

  const unmatched = analyzePerformanceTiming(
    score,
    [
      { t: 20, ...scratch("backward") },
    ],
    [],
    120,
  );
  assert.deepEqual(unmatched, {
    averageErrorMs: null,
    maxErrorMs: null,
    timingAccuracy: null,
    matchedCount: 0,
  });
});

Deno.test("timing accuracy bottoms at zero and exact timing is perfect", () => {
  const score = compile([["F"]]);
  const exact = analyzePerformanceTiming(
    score,
    [
      { t: 0, ...scratch("forward") },
    ],
    [],
    120,
  );
  assert.equal(exact.timingAccuracy, 100);

  const late = analyzePerformanceTiming(
    score,
    [
      { t: 200, ...scratch("forward") },
    ],
    [],
    120,
  );
  assert.equal(late.timingAccuracy, 0);
});
