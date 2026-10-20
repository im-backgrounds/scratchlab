import assert from "node:assert/strict";
import { chartCatalog } from "../../src/data/chart-catalog.js";
import {
  createEventCompressor,
  createStopObservation,
} from "../../src/domain/midi-mapping.js";
import {
  createExpectedTimeline,
  EVENT_MODEL_VERSION,
  matchPerformanceTimeline,
} from "../../src/domain/performance-analysis.js";
import {
  createLoopBoundary,
  createLoopState,
} from "../../src/domain/playback.js";
import { compileScoreData } from "../../src/domain/score-compiler.js";

Deno.test("the official event model version is 2", () => {
  assert.equal(EVENT_MODEL_VERSION, 2);
});

const compile = (score) =>
  compileScoreData({ name: "matching", beat: "4/4", score });
const forward = (time) => ({ type: "scratch", direction: "forward", time });
const backward = (time) => ({ type: "scratch", direction: "backward", time });
const fader = (state, time) => ({ type: "fader", state, time });
const expected = (score) => createExpectedTimeline(compile(score));

function loop(startTime = 1000, endTime = 2000, options = {}) {
  const settings = {
    sessionId: "matching-test",
    loopIndex: 1,
    phase: "recording",
    inputState: { currentDirection: "unknown", faderState: "open" },
    ...options,
  };
  return createLoopState(
    createLoopBoundary({ ...settings, edge: "start", time: startTime }),
    createLoopBoundary({ ...settings, edge: "end", time: endTime }),
  );
}

// Handwritten physical actions, independent of createExpectedTimeline.
const fixtures = [
  {
    id: "baby-scratch",
    groups: Array.from({ length: 4 }, () => [["forward", 0], ["backward", 0]])
      .flat(),
    count: 8,
  },
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
    count: 46,
  },
  {
    id: "one-click-flare-orbit",
    groups: Array.from({ length: 4 }, () => [
      ["forward", 0],
      ["forward", 1],
      ["backward", 0],
      ["backward", 1],
    ]).flat(),
    count: 24,
  },
];

for (const fixture of fixtures) {
  Deno.test(`v2 matcher: compressed ${fixture.id} ideal input scores 100% for two loops`, () => {
    const chart = chartCatalog.find((chart) => chart.id === fixture.id);
    assert.ok(chart);
    const timeline = createExpectedTimeline(compileScoreData(chart));
    const compressor = createEventCompressor();
    compressor.accept(fader("open", 900));
    const recorded = [];
    const loops = [];
    for (let take = 0; take < 2; take++) {
      const start = 1000 + take * 1000;
      loops.push(loop(start, start + 1000, {
        loopIndex: take + 1,
        inputState: compressor.getState(),
      }));
      let time = start;
      const feed = (event) => {
        const accepted = compressor.accept({ ...event, time: time++ });
        if (accepted) recorded.push(accepted);
      };
      for (const [direction, cuts] of fixture.groups) {
        for (let count = 0; count < Math.max(1, cuts); count++) {
          feed({ type: "scratch", direction });
          feed({ type: "scratch", direction });
          if (cuts) {
            feed({ type: "fader", state: "closed" });
            feed({ type: "fader", state: "open" });
          }
        }
      }
      const stop = createStopObservation({
        source: "mouse",
        lastMovementAt: time,
        timeoutMs: 180,
      });
      compressor.observeStop(stop);
      recorded.push(stop);
    }
    const before = structuredClone({ timeline, recorded, loops });
    const result = matchPerformanceTimeline(timeline, recorded, loops);
    assert.equal(result.accuracy, 100);
    assert.equal(result.matched, fixture.count * 2);
    assert.equal(result.actualCount, fixture.count * 2);
    assert.equal(result.missing, 0);
    assert.equal(result.extra, 0);
    assert.equal(result.initialStateValid, true);
    assert.deepEqual(result.loops.map((item) => item.accuracy), [100, 100]);
    assert.equal(result.pairs.length, fixture.count * 2);
    assert.equal(
      new Set(result.pairs.map((pair) => pair.actualIndex)).size,
      result.pairs.length,
    );
    for (const pair of result.pairs) {
      assert.equal(
        pair.kind,
        recorded[pair.actualIndex].direction ??
          (recorded[pair.actualIndex].state === "open"
            ? "faderOpen"
            : "faderClosed"),
      );
      assert.equal(pair.expectedTick, timeline[pair.expectedIndex].tick);
      assert.equal(pair.actualTime, recorded[pair.actualIndex].time);
      assert.equal(pair.timingEligible, true);
    }
    assert.deepEqual({ timeline, recorded, loops }, before);
    assert.deepEqual(
      matchPerformanceTimeline(timeline, recorded, loops),
      result,
    );
  });
}

Deno.test("v2 matcher retains exact original indexes across independent lanes", () => {
  const timeline = expected([["FC", "B"]]);
  const recorded = [
    forward(1000),
    backward(1010),
    fader("closed", 1020),
    fader("open", 1030),
  ];
  const result = matchPerformanceTimeline(timeline, recorded, [loop()]);
  assert.equal(result.accuracy, 100);
  assert.deepEqual(
    result.pairs.map((
      { expectedIndex, actualIndex },
    ) => [expectedIndex, actualIndex]),
    [
      [0, 0],
      [1, 2],
      [2, 3],
      [3, 1],
    ],
  );
});

Deno.test("v2 matcher reports Missing and Extra by kind with stable one-to-one pairs", () => {
  const timeline = expected([["F", "B", "F"]]);
  const result = matchPerformanceTimeline(timeline, [
    forward(1000),
    forward(1100),
    backward(1200),
  ], [loop()]);
  assert.deepEqual(
    result.pairs.map((
      { expectedIndex, actualIndex },
    ) => [expectedIndex, actualIndex]),
    [
      [0, 0],
      [2, 1],
    ],
  );
  assert.deepEqual(result.missingEvents, [{
    loopIndex: 1,
    expectedIndex: 1,
    kind: "backward",
    tick: timeline[1].tick,
  }]);
  assert.deepEqual(result.extraEvents, [{
    loopIndex: 1,
    actualIndex: 2,
    kind: "backward",
    time: 1200,
  }]);
  assert.equal(result.accuracy, 50);
  assert.deepEqual(result.byKind.backward, {
    matched: 0,
    missing: 1,
    extra: 1,
  });
});

Deno.test("v2 matcher excludes physical and legacy stops and loop controls", () => {
  const timeline = expected([["F"]]);
  const start = createLoopBoundary({
    edge: "start",
    sessionId: "matching-test",
    loopIndex: 1,
    phase: "recording",
    time: 1000,
    inputState: { currentDirection: "unknown", faderState: "open" },
  });
  const result = matchPerformanceTimeline(timeline, [
    start,
    forward(1000),
    createStopObservation({
      source: "midi",
      lastMovementAt: 1000,
      timeoutMs: 150,
    }),
    { type: "scratch", direction: "stop", time: 1200 },
    { ...start, edge: "end", time: 2000 },
  ], [loop()]);
  assert.equal(result.accuracy, 100);
  assert.equal(result.matched, 1);
  assert.equal(result.actualCount, 1);
  assert.equal(result.pairs[0].actualIndex, 1);
  assert.deepEqual(result.unassignedActualIndexes, []);
  assert.equal("stop" in result.byKind, false);
});

Deno.test("v2 matcher counts initial direction continuation as a non-timing match", () => {
  const result = matchPerformanceTimeline(expected([["F", "FF"]]), [
    fader("closed", 1100),
    fader("open", 1200),
  ], [loop(1000, 2000, {
    inputState: { currentDirection: "forward", faderState: "open" },
  })]);
  assert.equal(result.accuracy, 100);
  assert.equal(result.matched, 3);
  assert.equal(result.actualCount, 2);
  assert.deepEqual(result.pairs[0], {
    loopIndex: 1,
    lane: "scratch",
    kind: "forward",
    expectedIndex: 0,
    actualIndex: null,
    expectedTick: 0,
    actualTime: null,
    source: "initial-state",
    timingEligible: false,
  });
  assert.equal(
    result.pairs.slice(1).every((pair) => pair.timingEligible),
    true,
  );
});

Deno.test("v2 matcher does not infer strokes after K or from unknown, opposite or stopped state", () => {
  for (const currentDirection of ["unknown", "backward", "stopped"]) {
    const result = matchPerformanceTimeline(expected([["F"]]), [], [
      loop(1000, 2000, {
        inputState: { currentDirection, faderState: "open" },
      }),
    ]);
    assert.equal(result.missing, 1);
    assert.equal(result.accuracy, 0);
  }
  const afterK = matchPerformanceTimeline(expected([["K", "F"]]), [], [
    loop(1000, 2000, {
      inputState: { currentDirection: "forward", faderState: "open" },
    }),
  ]);
  assert.equal(afterK.missing, 1);
});

Deno.test("v2 matcher keeps a new stroke after a real stop, even with initial continuation", () => {
  const result = matchPerformanceTimeline(expected([["F"]]), [
    createStopObservation({
      source: "mouse",
      lastMovementAt: 900,
      timeoutMs: 180,
    }),
    forward(1200),
  ], [
    loop(1000, 2000, {
      inputState: { currentDirection: "forward", faderState: "open" },
    }),
  ]);
  assert.equal(result.matched, 1);
  assert.equal(result.extra, 1);
  assert.equal(result.accuracy, 50);
  assert.equal(result.extraEvents[0].actualIndex, 1);
});

Deno.test("v2 initial fader validation is independent of accuracy and does not infer from later events", () => {
  for (
    const [faderState, status] of [
      ["open", "valid"],
      ["closed", "mismatch"],
      ["unknown", "unconfirmed"],
    ]
  ) {
    const result = matchPerformanceTimeline(expected([["FM", "BO"]]), [
      fader("closed", 1000),
      forward(1000),
      fader("open", 1100),
      backward(1100),
    ], [
      loop(1000, 2000, {
        inputState: { currentDirection: "unknown", faderState },
      }),
    ]);
    assert.equal(result.accuracy, 100);
    assert.equal(result.initialStateValid, faderState === "open");
    assert.equal(result.loops[0].initialState.status, status);
    assert.equal(result.loops[0].initialState.expectedFaderState, "open");
  }
});

Deno.test("v2 matching uses half-open ownership and never pairs across loops or demo", () => {
  const loops = [
    loop(0, 1000, { loopIndex: 0, phase: "demo" }),
    loop(1000, 2000),
    loop(2000, 3000, { loopIndex: 2 }),
  ];
  const result = matchPerformanceTimeline(expected([["F", "B"]]), [
    forward(999),
    forward(1000),
    backward(1999),
    forward(2000),
    backward(3000),
  ], loops);
  assert.deepEqual(
    result.loops.map(({ matched, missing, extra }) => ({
      matched,
      missing,
      extra,
    })),
    [
      { matched: 2, missing: 0, extra: 0 },
      { matched: 1, missing: 1, extra: 0 },
    ],
  );
  assert.deepEqual(
    result.pairs.map(({ loopIndex, actualIndex }) => [loopIndex, actualIndex]),
    [
      [1, 1],
      [1, 2],
      [2, 3],
    ],
  );
  assert.deepEqual(result.unassignedActualIndexes, [0, 4]);
  assert.equal(result.accuracy, 75);
});

Deno.test("v2 empty and missing recordings have explicit unavailable or zero accuracy", () => {
  assert.equal(matchPerformanceTimeline([], [], [loop()]).accuracy, null);
  const missing = matchPerformanceTimeline(expected([["F", "B"]]), [], [
    loop(),
  ]);
  assert.equal(missing.accuracy, 0);
  assert.equal(missing.missing, 2);
  const extra = matchPerformanceTimeline([], [forward(1000)], [loop()]);
  assert.equal(extra.extra, 1);
  assert.equal(extra.accuracy, 0);
  const demoOnly = matchPerformanceTimeline(expected([["F"]]), [], [
    loop(1000, 2000, { phase: "demo" }),
  ]);
  assert.equal(demoOnly.accuracy, null);
  assert.equal(demoOnly.initialStateValid, false);
});

Deno.test("v2 matcher rejects malformed timelines and overlapping or foreign loop states", () => {
  const timeline = expected([["F"]]);
  for (
    const events of [
      [forward(NaN)],
      [forward(1200), backward(1100)],
      [{ type: "other", time: 1100 }],
      [{ type: "stop", source: "mouse", time: 1100 }],
    ]
  ) {
    assert.throws(
      () => matchPerformanceTimeline(timeline, events, [loop()]),
      TypeError,
    );
  }
  for (
    const badExpected of [
      [{ type: "scratch", direction: "stop", tick: 0 }],
      [{ type: "scratch", direction: "forward", tick: -1 }],
      [{ type: "scratch", direction: "forward", tick: 2 }, {
        type: "scratch",
        direction: "backward",
        tick: 1,
      }],
    ]
  ) {
    assert.throws(
      () => matchPerformanceTimeline(badExpected, [], [loop()]),
      TypeError,
    );
  }
  for (
    const loops of [
      [],
      [{ ...loop(), startFaderState: "invalid" }],
      [loop(), loop(1500, 2500, { loopIndex: 2 })],
      [loop(), loop(2000, 3000, { sessionId: "other", loopIndex: 2 })],
      [loop(), loop(2000, 3000)],
    ]
  ) {
    assert.throws(
      () => matchPerformanceTimeline(timeline, [], loops),
      TypeError,
    );
  }
});

Deno.test("v2 missing and extra fader changes are separate from direction matches", () => {
  const timeline = expected([["FC", "B"]]);
  const result = matchPerformanceTimeline(timeline, [
    forward(1000),
    fader("closed", 1100),
    fader("closed", 1200),
    backward(1300),
  ], [loop()]);
  assert.equal(result.matched, 3);
  assert.equal(result.missing, 1);
  assert.equal(result.extra, 1);
  assert.equal(result.accuracy, 60);
  assert.deepEqual(result.byKind.faderOpen, {
    matched: 0,
    missing: 1,
    extra: 0,
  });
  assert.deepEqual(result.byKind.faderClosed, {
    matched: 1,
    missing: 0,
    extra: 1,
  });
  assert.equal(result.missingEvents[0].expectedIndex, 2);
  assert.equal(result.extraEvents[0].actualIndex, 2);
});

Deno.test("v2 Stop count and within-loop timing do not change sequence accuracy", () => {
  const timeline = expected([["F", "B"]]);
  const base = matchPerformanceTimeline(timeline, [
    forward(1000),
    backward(1001),
  ], [loop()]);
  const delayed = matchPerformanceTimeline(timeline, [
    createStopObservation({
      source: "midi",
      lastMovementAt: 900,
      timeoutMs: 150,
    }),
    forward(1800),
    createStopObservation({
      source: "mouse",
      lastMovementAt: 1700,
      timeoutMs: 180,
    }),
    backward(1999),
  ], [loop()]);
  assert.equal(base.accuracy, 100);
  assert.equal(delayed.accuracy, base.accuracy);
  assert.deepEqual(delayed.byKind, base.byKind);
  assert.deepEqual(delayed.pairs.map((pair) => pair.actualIndex), [1, 3]);
  assert.deepEqual(delayed.pairs.map((pair) => pair.actualTime), [1800, 1999]);
});

Deno.test("v2 continuation is counted in each loop without inventing timing samples", () => {
  const timeline = expected([["F"]]);
  const inputState = { currentDirection: "forward", faderState: "open" };
  const result = matchPerformanceTimeline(timeline, [], [
    loop(1000, 2000, { inputState }),
    loop(2000, 3000, { loopIndex: 2, inputState }),
  ]);
  assert.equal(result.accuracy, 100);
  assert.equal(result.expectedCount, 2);
  assert.equal(result.actualCount, 0);
  assert.equal(result.matched, 2);
  assert.equal(
    result.pairs.every((pair) =>
      pair.source === "initial-state" && !pair.timingEligible &&
      pair.actualIndex === null && pair.actualTime === null
    ),
    true,
  );
});

Deno.test("v2 alignment does not reuse one event to fill two expected strokes", () => {
  const result = matchPerformanceTimeline(
    expected([["F", "B", "F"]]),
    [forward(1000)],
    [loop()],
  );
  assert.equal(result.matched, 1);
  assert.equal(result.missing, 2);
  assert.equal(result.extra, 0);
  assert.equal(result.accuracy, 33.3);
  assert.deepEqual(result.pairs.map((pair) => pair.expectedIndex), [0]);
});
