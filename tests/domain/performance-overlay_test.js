import assert from "node:assert/strict";
import { chartCatalog } from "../../src/data/chart-catalog.js";
import { createStopObservation } from "../../src/domain/midi-mapping.js";
import {
  analyzeTimelineTiming,
  createExpectedTimeline,
  matchPerformanceTimeline,
} from "../../src/domain/performance-analysis.js";
import { createPerformanceOverlay } from "../../src/domain/performance-overlay.js";
import {
  createLoopBoundary,
  createLoopState,
} from "../../src/domain/playback.js";
import { compileScoreData } from "../../src/domain/score-compiler.js";

function loop(
  index,
  start,
  end,
  direction = "unknown",
  faderState = "open",
  phase = "recording",
) {
  const settings = {
    sessionId: "overlay-test",
    loopIndex: index,
    phase,
    inputState: { currentDirection: direction, faderState },
  };
  return createLoopState(
    createLoopBoundary({ ...settings, edge: "start", time: start }),
    createLoopBoundary({ ...settings, edge: "end", time: end }),
  );
}

function analyze(score, expected, recorded, loops) {
  const matching = matchPerformanceTimeline(expected, recorded, loops);
  const timing = analyzeTimelineTiming(score, matching, loops, 120);
  const inputs = [expected, recorded, loops, matching, timing];
  return {
    matching,
    timing,
    inputs,
    overlay: createPerformanceOverlay(...inputs),
  };
}

for (const id of ["baby-scratch", "chirp-scratch", "one-click-flare-orbit"]) {
  for (const scenario of ["perfect", "missing-extra", "initial-state"]) {
    Deno.test(`v2 overlay ${id}: ${scenario} counts equal Matching and Timing`, () => {
      const score = compileScoreData(
        chartCatalog.find((chart) => chart.id === id),
      );
      const expected = createExpectedTimeline(score);
      const tickMs = score.tickDurationSeconds * 60000 / 120;
      const duration = score.totalTicks * tickMs;
      const loops = [0, 1].map((take) =>
        loop(
          take + 1,
          1000 + take * duration,
          1000 + (take + 1) * duration,
          "unknown",
          scenario === "initial-state" ? (take ? "unknown" : "closed") : "open",
        )
      );
      const recorded = loops.flatMap((interval) => {
        const events = expected.flatMap(({ tick, ...event }, index) =>
          scenario === "missing-extra" && index === 0 ? [] : [{
            ...event,
            time: interval.startTime + tick * tickMs,
          }]
        );
        if (scenario === "missing-extra") {
          events.push({
            type: "fader",
            state: "closed",
            time: interval.endTime - 1,
          });
        }
        events.push(createStopObservation({
          source: "mouse",
          lastMovementAt: interval.endTime - 180.5,
          timeoutMs: 180,
        }));
        return events.sort((a, b) => a.time - b.time);
      });
      const { overlay, matching, timing, inputs } = analyze(
        score,
        expected,
        recorded,
        loops,
      );
      assert.equal(overlay.counts.missing, matching.missing);
      assert.equal(overlay.counts.extra, matching.extra);
      assert.equal(overlay.counts.measuredCount, timing.measuredCount);
      assert.equal(overlay.sample.length, expected.length * 2);
      assert.equal(overlay.you.length, matching.actualCount);
      assert.equal(
        overlay.counts.initialStateErrors,
        scenario === "initial-state" ? 2 : 0,
      );
      if (scenario === "missing-extra") {
        assert.equal(matching.missing, 2);
        assert.equal(matching.extra, 2);
      }
      if (scenario === "perfect") assert.equal(matching.accuracy, 100);
      assert.ok(
        overlay.sample.every((entry) =>
          !["stop", "loop-boundary"].includes(entry.kind)
        ),
      );
      assert.ok(
        overlay.you.every((entry) =>
          !["stop", "loop-boundary"].includes(entry.kind)
        ),
      );
      for (const sample of timing.samples) {
        const target = overlay.sample.find((entry) =>
          entry.loopIndex === sample.loopIndex &&
          entry.expectedIndex === sample.expectedIndex
        );
        const actual = overlay.you.find((entry) =>
          entry.actualIndex === sample.actualIndex
        );
        assert.deepEqual(target.timing, sample);
        assert.deepEqual(actual.timing, sample);
      }
      for (
        const entry of overlay.sample.filter((entry) =>
          entry.status === "missing"
        )
      ) {
        assert.equal(entry.timing, null);
      }
      for (
        const entry of overlay.you.filter((entry) => entry.status === "extra")
      ) {
        assert.equal(entry.timing, null);
      }
      const before = structuredClone(inputs);
      assert.deepEqual(createPerformanceOverlay(...inputs), overlay);
      assert.deepEqual(inputs, before);
      if (overlay.sample[0].timing) {
        overlay.sample[0].timing.signedErrorMs = 999;
      }
      assert.deepEqual(inputs, before);
    });
  }
}

Deno.test("v2 overlay shows continuation on SAMPLE only, never as invented YOU or timing", () => {
  const score = compileScoreData({
    name: "continuation",
    beat: "4/4",
    score: [["F", "FF"]],
  });
  const expected = createExpectedTimeline(score);
  const loops = [loop(1, 1000, 4000, "forward")];
  const { overlay, matching } = analyze(score, expected, [
    { type: "fader", state: "closed", time: 2510 },
    { type: "fader", state: "open", time: 2530 },
  ], loops);
  assert.equal(matching.accuracy, 100);
  assert.equal(overlay.sample[0].matchSource, "initial-state");
  assert.equal(overlay.sample[0].actualIndex, null);
  assert.equal(overlay.sample[0].timing, null);
  assert.equal(overlay.you.length, 2);
  assert.equal(overlay.counts.measuredCount, 2);
  assert.deepEqual(overlay.errors, []);
});

Deno.test("v2 overlay follows half-open loop ownership, excludes demo and control markers", () => {
  const score = compileScoreData({
    name: "boundary",
    beat: "4/4",
    score: [["F"]],
  });
  const expected = createExpectedTimeline(score);
  const loops = [
    loop(0, 0, 1000, "unknown", "open", "demo"),
    loop(1, 1000, 2000),
    loop(2, 2000, 3000),
  ];
  const boundary = createLoopBoundary({
    edge: "end",
    time: 2000,
    sessionId: "overlay-test",
    loopIndex: 1,
    phase: "recording",
    inputState: { currentDirection: "forward", faderState: "open" },
  });
  const { overlay } = analyze(score, expected, [
    { type: "scratch", direction: "forward", time: 999 },
    { type: "scratch", direction: "forward", time: 1000 },
    { type: "scratch", direction: "stop", time: 1500 },
    boundary,
    { type: "scratch", direction: "forward", time: 2000 },
    { type: "scratch", direction: "backward", time: 3000 },
  ], loops);
  assert.deepEqual(
    overlay.you.map((
      { loopIndex, actualIndex, timeMs },
    ) => [loopIndex, actualIndex, timeMs]),
    [[1, 1, 0], [2, 4, 0]],
  );
  assert.deepEqual(overlay.counts, {
    missing: 0,
    extra: 0,
    initialStateErrors: 0,
    measuredCount: 2,
  });
});

Deno.test("v2 overlay handles empty, missing-only and continuation-only analysis", () => {
  const score = compileScoreData({
    name: "empty",
    beat: "4/4",
    score: [["F"]],
  });
  const expected = createExpectedTimeline(score);
  const missing = analyze(score, expected, [], [loop(1, 1000, 4000)]).overlay;
  assert.equal(missing.counts.missing, 1);
  assert.equal(missing.sample[0].timing, null);
  const continuation =
    analyze(score, expected, [], [loop(1, 1000, 4000, "forward")]).overlay;
  assert.equal(continuation.counts.measuredCount, 0);
  assert.deepEqual(continuation.you, []);
  assert.deepEqual(continuation.errors, []);
  const empty = analyze(score, [], [], [loop(1, 1000, 4000)]).overlay;
  assert.deepEqual(empty, {
    sample: [],
    you: [],
    errors: [],
    counts: {
      missing: 0,
      extra: 0,
      initialStateErrors: 0,
      measuredCount: 0,
    },
  });
});

Deno.test("v2 overlay rejects inconsistent analysis instead of inventing error classifications", () => {
  const score = compileScoreData({
    name: "invalid",
    beat: "4/4",
    score: [["F"]],
  });
  const expected = createExpectedTimeline(score);
  const { inputs, matching, timing } = analyze(score, expected, [
    { type: "scratch", direction: "forward", time: 1010 },
  ], [loop(1, 1000, 4000)]);
  const alteredMatching = [
    { ...matching, missing: 99 },
    { ...matching, pairs: [] },
    { ...matching, pairs: [{ ...matching.pairs[0], actualIndex: 99 }] },
    { ...matching, loops: [] },
  ];
  for (const changed of alteredMatching) {
    assert.throws(
      () =>
        createPerformanceOverlay(
          inputs[0],
          inputs[1],
          inputs[2],
          changed,
          timing,
        ),
      TypeError,
    );
  }
  for (
    const changed of [
      { ...timing, measuredCount: 99 },
      { ...timing, samples: [] },
      { ...timing, samples: [timing.samples[0], timing.samples[0]] },
      { ...timing, samples: [{ ...timing.samples[0], actualIndex: 99 }] },
      { ...timing, samples: [{ ...timing.samples[0], actualTimeMs: 99 }] },
    ]
  ) {
    assert.throws(
      () =>
        createPerformanceOverlay(
          inputs[0],
          inputs[1],
          inputs[2],
          matching,
          changed,
        ),
      TypeError,
    );
  }
});

Deno.test("v2 overlay preserves ambiguous Matching choices and Missing/Extra indexes", () => {
  const score = compileScoreData({
    name: "ambiguous",
    beat: "4/4",
    score: [["F", "B", "F"]],
  });
  const expected = createExpectedTimeline(score);
  const { overlay, matching, timing } = analyze(score, expected, [
    { type: "scratch", direction: "forward", time: 1010 },
    { type: "scratch", direction: "forward", time: 1040 },
    { type: "scratch", direction: "backward", time: 1700 },
  ], [loop(1, 1000, 4000)]);
  assert.deepEqual(
    overlay.sample.filter((entry) => entry.status === "matched")
      .map(({ expectedIndex, actualIndex }) => [expectedIndex, actualIndex]),
    matching.pairs.map((
      { expectedIndex, actualIndex },
    ) => [expectedIndex, actualIndex]),
  );
  assert.deepEqual(
    overlay.errors.filter((error) => error.classification === "missing")
      .map(({ classification: _classification, ...error }) => error),
    matching.missingEvents,
  );
  assert.deepEqual(
    overlay.errors.filter((error) => error.classification === "extra")
      .map(({
        classification: _classification,
        timeMs: _timeMs,
        ...error
      }) => error),
    matching.extraEvents,
  );
  assert.equal(overlay.sample[2].actualIndex, 1);
  assert.equal(overlay.counts.measuredCount, timing.measuredCount);
});
