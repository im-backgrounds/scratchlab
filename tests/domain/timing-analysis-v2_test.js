import assert from "node:assert/strict";
import { chartCatalog } from "../../src/data/chart-catalog.js";
import { createStopObservation } from "../../src/domain/midi-mapping.js";
import {
  analyzeTimelineTiming,
  createExpectedTimeline,
  matchPerformanceTimeline,
} from "../../src/domain/performance-analysis.js";
import {
  createLoopBoundary,
  createLoopState,
} from "../../src/domain/playback.js";
import { compileScoreData } from "../../src/domain/score-compiler.js";

const compile = (score) =>
  compileScoreData({ name: "v2 timing", beat: "4/4", score });
const scratch = (direction, time) => ({ type: "scratch", direction, time });
const fader = (state, time) => ({ type: "fader", state, time });
function loop(startTime = 1000, endTime = 4000, options = {}) {
  const settings = {
    sessionId: "timing-test",
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
const unavailable = {
  averageErrorMs: null,
  maxErrorMs: null,
  timingAccuracy: null,
  measuredCount: 0,
  samples: [],
};

Deno.test("v2 timing measures signed early/late error from the exact matching pairs", () => {
  const score = compile([["K", "F", "B"]]);
  const loops = [loop()];
  const matching = matchPerformanceTimeline(createExpectedTimeline(score), [
    scratch("forward", 1000 + 2000 / 3 - 20),
    scratch("backward", 1000 + 4000 / 3 + 40),
  ], loops);
  const before = structuredClone({ score, loops, matching });
  const result = analyzeTimelineTiming(score, matching, loops, 120);
  assert.equal(result.measuredCount, 2);
  assert.ok(Math.abs(result.averageErrorMs - 30) < 1e-9);
  assert.ok(Math.abs(result.maxErrorMs - 40) < 1e-9);
  assert.equal(result.timingAccuracy, 70);
  assert.ok(Math.abs(result.samples[0].signedErrorMs + 20) < 1e-9);
  assert.ok(Math.abs(result.samples[1].signedErrorMs - 40) < 1e-9);
  assert.deepEqual(
    result.samples.map((
      { expectedIndex, actualIndex },
    ) => [expectedIndex, actualIndex]),
    matching.pairs.map((
      { expectedIndex, actualIndex },
    ) => [expectedIndex, actualIndex]),
  );
  assert.deepEqual({ score, loops, matching }, before);
  assert.deepEqual(analyzeTimelineTiming(score, matching, loops, 120), result);
});

Deno.test("v2 timing retains the matcher's ambiguous LCS choice rather than rematching by time", () => {
  const score = compile([["F", "B", "F"]]);
  const loops = [loop()];
  const matching = matchPerformanceTimeline(createExpectedTimeline(score), [
    scratch("forward", 1010),
    scratch("forward", 1040),
    scratch("backward", 1700),
  ], loops);
  const result = analyzeTimelineTiming(score, matching, loops, 120);
  assert.equal(matching.missing, 1);
  assert.equal(matching.extra, 1);
  assert.deepEqual(
    result.samples.map((
      { expectedIndex, actualIndex },
    ) => [expectedIndex, actualIndex]),
    [
      [0, 0],
      [2, 1],
    ],
  );
  assert.equal(result.measuredCount, 2);
  assert.equal(result.samples[1].actualTimeMs, 40);
});

Deno.test("v2 timing excludes continuations but measures both fader transitions", () => {
  const score = compile([["F", "FF"]]);
  const loops = [loop(1000, 4000, {
    inputState: { currentDirection: "forward", faderState: "open" },
  })];
  const matching = matchPerformanceTimeline(createExpectedTimeline(score), [
    fader("closed", 2510),
    fader("open", 2530),
  ], loops);
  const result = analyzeTimelineTiming(score, matching, loops, 120);
  assert.equal(matching.matched, 3);
  assert.equal(matching.pairs[0].actualIndex, null);
  assert.equal(result.measuredCount, 2);
  assert.equal(result.averageErrorMs, 20);
  assert.equal(result.maxErrorMs, 30);
  assert.equal(result.timingAccuracy, 80);
  assert.deepEqual(result.samples.map((sample) => sample.kind), [
    "faderClosed",
    "faderOpen",
  ]);
});

Deno.test("v2 timing never substitutes zero for missing, extra or unavailable events", () => {
  const score = compile([["F", "B"]]);
  const loops = [loop()];
  const matching = matchPerformanceTimeline(createExpectedTimeline(score), [
    scratch("forward", 1050),
    scratch("forward", 1200),
  ], loops);
  assert.equal(matching.missing, 1);
  assert.equal(matching.extra, 1);
  const result = analyzeTimelineTiming(score, matching, loops, 120);
  assert.equal(result.measuredCount, 1);
  assert.equal(result.averageErrorMs, 50);
  assert.equal(result.maxErrorMs, 50);
  assert.equal(result.timingAccuracy, 50);
  for (const recorded of [[], [fader("closed", 1100)]]) {
    const noPairs = matchPerformanceTimeline(
      createExpectedTimeline(score),
      recorded,
      loops,
    );
    assert.deepEqual(
      analyzeTimelineTiming(score, noPairs, loops, 120),
      unavailable,
    );
  }
});

Deno.test("v2 timing returns unavailable for continuation-only and empty comparisons", () => {
  const score = compile([["F"]]);
  const loops = [loop(1000, 4000, {
    inputState: { currentDirection: "forward", faderState: "open" },
  })];
  const matching = matchPerformanceTimeline(
    createExpectedTimeline(score),
    [],
    loops,
  );
  assert.equal(matching.accuracy, 100);
  assert.deepEqual(
    analyzeTimelineTiming(score, matching, loops, 120),
    unavailable,
  );
  const empty = matchPerformanceTimeline([], [], loops);
  assert.deepEqual(
    analyzeTimelineTiming(score, empty, loops, 120),
    unavailable,
  );
});

Deno.test("v2 timing excludes Stop and boundary controls and preserves actual indexes", () => {
  const score = compile([["F"]]);
  const start = createLoopBoundary({
    edge: "start",
    sessionId: "timing-test",
    loopIndex: 1,
    phase: "recording",
    time: 1000,
    inputState: { currentDirection: "unknown", faderState: "open" },
  });
  const loops = [loop()];
  const matching = matchPerformanceTimeline(createExpectedTimeline(score), [
    start,
    scratch("forward", 1025),
    createStopObservation({
      source: "mouse",
      lastMovementAt: 1025,
      timeoutMs: 180,
    }),
    scratch("stop", 1300),
    { ...start, edge: "end", time: 4000 },
  ], loops);
  const result = analyzeTimelineTiming(score, matching, loops, 120);
  assert.equal(result.measuredCount, 1);
  assert.equal(result.averageErrorMs, 25);
  assert.equal(result.samples[0].actualIndex, 1);
});

Deno.test("v2 timing honors both exclusion flags independently and filters non-meaning kinds", () => {
  const score = compile([["F"]]);
  const loops = [loop()];
  const matching = matchPerformanceTimeline(createExpectedTimeline(score), [
    scratch("forward", 1010),
  ], loops);
  const pair = matching.pairs[0];
  for (
    const overrides of [
      { actualIndex: null },
      { timingEligible: false },
      { source: "initial-state" },
      { kind: "stop" },
      { kind: "loop-boundary" },
    ]
  ) {
    assert.deepEqual(
      analyzeTimelineTiming(
        score,
        { ...matching, pairs: [{ ...pair, ...overrides }] },
        loops,
        120,
      ),
      unavailable,
    );
  }
});

Deno.test("v2 timing uses each recording loop's absolute origin and excludes demo/end events", () => {
  const score = compile([["F"]]);
  const loops = [
    loop(0, 1000, { loopIndex: 0, phase: "demo" }),
    loop(1000, 2000),
    loop(2000, 3000, { loopIndex: 2 }),
  ];
  const matching = matchPerformanceTimeline(createExpectedTimeline(score), [
    scratch("forward", 999),
    scratch("forward", 1010),
    scratch("forward", 2000),
    scratch("forward", 3000),
  ], loops);
  const result = analyzeTimelineTiming(score, matching, loops, 120);
  assert.equal(result.measuredCount, 2);
  assert.equal(result.averageErrorMs, 5);
  assert.equal(result.maxErrorMs, 10);
  assert.equal(result.timingAccuracy, 95);
  assert.deepEqual(
    result.samples.map((
      { loopIndex, actualIndex, signedErrorMs },
    ) => [loopIndex, actualIndex, signedErrorMs]),
    [[1, 1, 10], [2, 2, 0]],
  );
});

Deno.test("v2 timing averages all samples instead of averaging loop averages", () => {
  const score = compile([["F", "B"]]);
  const loops = [loop(1000, 4000), loop(4000, 7000, { loopIndex: 2 })];
  const matching = matchPerformanceTimeline(createExpectedTimeline(score), [
    scratch("forward", 1010),
    scratch("backward", 2010),
    scratch("forward", 4090),
  ], loops);
  const result = analyzeTimelineTiming(score, matching, loops, 120);
  assert.equal(result.measuredCount, 3);
  assert.ok(Math.abs(result.averageErrorMs - 110 / 3) < 1e-9);
  assert.equal(result.maxErrorMs, 90);
  assert.equal(result.timingAccuracy, 63.3);
});

for (const bpm of [60, 80, 120]) {
  Deno.test(`v2 timing: catalog meaning pairs at ${bpm} BPM have exact zero error`, () => {
    for (
      const id of ["baby-scratch", "chirp-scratch", "one-click-flare-orbit"]
    ) {
      const score = compileScoreData(
        chartCatalog.find((chart) => chart.id === id),
      );
      const timeline = createExpectedTimeline(score);
      const tickMs = score.tickDurationSeconds * 60000 / bpm;
      const loops = [loop(0, score.totalTicks * tickMs)];
      const recorded = timeline.map(({ tick, ...event }) => ({
        ...event,
        time: tick * tickMs,
      }));
      const matching = matchPerformanceTimeline(timeline, recorded, loops);
      const result = analyzeTimelineTiming(score, matching, loops, bpm);
      assert.equal(result.measuredCount, timeline.length, id);
      assert.equal(result.averageErrorMs, 0, id);
      assert.equal(result.maxErrorMs, 0, id);
      assert.equal(result.timingAccuracy, 100, id);
    }
  });
}

Deno.test("v2 timing accuracy floors at zero without changing sequence accuracy", () => {
  const score = compile([["F"]]);
  const loops = [loop()];
  for (const [delay, accuracy] of [[0, 100], [99.9, 0.1], [100, 0], [250, 0]]) {
    const matching = matchPerformanceTimeline(createExpectedTimeline(score), [
      scratch("forward", 1000 + delay),
    ], loops);
    assert.equal(matching.accuracy, 100);
    assert.equal(
      analyzeTimelineTiming(score, matching, loops, 120).timingAccuracy,
      accuracy,
    );
    assert.equal(matching.accuracy, 100);
  }
});

Deno.test("v2 timing rejects invalid scale, loop and measured pair data explicitly", () => {
  const score = compile([["F"]]);
  const loops = [loop()];
  const matching = matchPerformanceTimeline(createExpectedTimeline(score), [
    scratch("forward", 1010),
  ], loops);
  for (const bpm of [0, -1, NaN, Infinity, Number.MIN_VALUE]) {
    assert.throws(
      () => analyzeTimelineTiming(score, matching, loops, bpm),
      TypeError,
    );
  }
  for (const tickDurationSeconds of [0, -1, NaN, Infinity]) {
    assert.throws(
      () =>
        analyzeTimelineTiming({ tickDurationSeconds }, matching, loops, 120),
      TypeError,
    );
  }
  for (
    const badLoops of [
      [],
      [loops[0], loops[0]],
      [{ ...loops[0], endTime: 1000 }],
      [{ ...loops[0], phase: "demo" }],
    ]
  ) {
    assert.throws(
      () => analyzeTimelineTiming(score, matching, badLoops, 120),
      TypeError,
    );
  }
  for (
    const overrides of [
      { actualTime: NaN },
      { actualTime: 4000 },
      { actualTime: 999 },
      { expectedTick: NaN },
      { expectedTick: -1 },
      { expectedTick: Number.MAX_VALUE },
      { actualIndex: -1 },
      { expectedIndex: -1 },
      { loopIndex: 99 },
      { timingEligible: undefined },
      { source: "unknown" },
    ]
  ) {
    assert.throws(() =>
      analyzeTimelineTiming(
        score,
        {
          ...matching,
          pairs: [{ ...matching.pairs[0], ...overrides }],
        },
        loops,
        120,
      ), TypeError);
  }
});
