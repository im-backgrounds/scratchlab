import assert from "node:assert/strict";
import { createGhostOverlayData } from "../../src/domain/ghost-overlay.js";
import { createPerformanceOverlay } from "../../src/domain/performance-overlay.js";
import {
  analyzeTimelineTiming,
  createExpectedTimeline,
  matchPerformanceTimeline,
} from "../../src/domain/performance-analysis.js";
import { compileScoreData } from "../../src/domain/score-compiler.js";

const score = compileScoreData({
  name: "Ghost",
  beat: "4/4",
  score: [["F", "B"]],
});
const bpm = 120;
const duration = score.totalTicks * score.tickDurationSeconds * 60000 / bpm;
const loops = [1, 2].map((loopIndex) => ({
  sessionId: "ghost-overlay-test",
  loopIndex,
  phase: "recording",
  startTime: 1000 + (loopIndex - 1) * duration,
  endTime: 1000 + loopIndex * duration,
  startDirection: "unknown",
  startFaderState: "open",
}));
const ghost = {
  recordedTimeline: [
    { type: "scratch", direction: "forward", time: 1000 },
    { type: "scratch", direction: "backward", time: 1000 + duration / 4 },
    { type: "fader", state: "open", time: 1000 + duration / 2 },
    { type: "fader", state: "closed", time: 1000 + duration * 3 / 4 },
  ],
};

Deno.test("Ghost overlay preserves all four Meaning Events with exact coordinates", () => {
  assert.deepEqual(createGhostOverlayData(ghost, loops, bpm, score), {
    events: ["forward", "backward", "faderOpen", "faderClosed"].map((
      kind,
      i,
    ) => ({
      kind,
      timeMs: duration * i / 4,
      position: i / 4,
      loopIndex: 1,
    })),
  });
});

Deno.test("Ghost overlay without a Ghost returns null; empty timeline returns no events", () => {
  assert.equal(createGhostOverlayData(null), null);
  assert.equal(createGhostOverlayData(undefined), null);
  assert.deepEqual(
    createGhostOverlayData({ recordedTimeline: [] }, loops, bpm, score),
    { events: [] },
  );
});

Deno.test("Ghost overlay excludes Stop and Loop Boundary without generating events", () => {
  const input = {
    recordedTimeline: [
      ...ghost.recordedTimeline,
      { type: "stop", time: loops[1].startTime },
      { type: "loop-boundary", time: loops[1].startTime },
    ],
  };
  assert.deepEqual(
    createGhostOverlayData(input, loops, bpm, score),
    createGhostOverlayData(ghost, loops, bpm, score),
  );
});

Deno.test("Ghost overlay uses half-open loop boundaries and excludes outside/demo events", () => {
  const timeline = [
    0,
    loops[0].startTime,
    loops[1].startTime,
    loops[1].endTime,
  ].map((time) => ({ type: "scratch", direction: "forward", time }));
  const result = createGhostOverlayData(
    { recordedTimeline: timeline },
    loops,
    bpm,
    score,
  );
  assert.deepEqual(
    result.events.map(({ loopIndex, timeMs, position }) => ({
      loopIndex,
      timeMs,
      position,
    })),
    [
      { loopIndex: 1, timeMs: 0, position: 0 },
      { loopIndex: 2, timeMs: 0, position: 0 },
    ],
  );
  assert.deepEqual(
    createGhostOverlayData(
      ghost,
      loops.map((loop) => ({ ...loop, phase: "demo" })),
      bpm,
      score,
    ),
    { events: [] },
  );
});

Deno.test("Ghost overlay is reproducible, detached and does not mutate any inputs", () => {
  const inputs = structuredClone([ghost, loops, bpm, score]);
  const before = structuredClone(inputs);
  const first = createGhostOverlayData(...inputs);
  assert.deepEqual(first, createGhostOverlayData(...inputs));
  assert.deepEqual(inputs, before);
  first.events[0].timeMs = 999;
  assert.deepEqual(inputs, before);
  assert.equal(createGhostOverlayData(...inputs).events[0].timeMs, 0);
});

Deno.test("Ghost overlay uses supplied BPM and score duration and caps delayed-end positions", () => {
  const result = createGhostOverlayData(ghost, loops, bpm * 2, score);
  assert.deepEqual(result.events.map((event) => event.position), [
    0,
    0.5,
    1,
    1,
  ]);
});

Deno.test("Ghost overlay invalid inputs return null with a warning, without throwing", () => {
  const warn = console.warn;
  let warnings = 0;
  console.warn = () => warnings++;
  try {
    const cases = [
      [{}, loops, bpm, score],
      [ghost, null, bpm, score],
      [ghost, [null], bpm, score],
      [ghost, [loops[0], loops[0]], bpm, score],
      [ghost, loops, 0, score],
      [ghost, loops, bpm, null],
      [{ recordedTimeline: [null] }, loops, bpm, score],
      [
        { recordedTimeline: [{ type: "scratch", direction: "stop", time: 1 }] },
        loops,
        bpm,
        score,
      ],
      [
        {
          recordedTimeline: [{
            type: "scratch",
            direction: "forward",
            time: NaN,
          }],
        },
        loops,
        bpm,
        score,
      ],
      [
        { recordedTimeline: [...ghost.recordedTimeline].reverse() },
        loops,
        bpm,
        score,
      ],
    ];
    for (const inputs of cases) {
      assert.equal(createGhostOverlayData(...inputs), null);
    }
    assert.equal(warnings, cases.length);
  } finally {
    console.warn = warn;
  }
});

Deno.test("Ghost projection kinds, times and loop indices agree with v2 YOU projection", () => {
  const expected = createExpectedTimeline(score);
  const matching = matchPerformanceTimeline(
    expected,
    ghost.recordedTimeline,
    loops,
  );
  const timing = analyzeTimelineTiming(score, matching, loops, bpm);
  const overlay = createPerformanceOverlay(
    expected,
    ghost.recordedTimeline,
    loops,
    matching,
    timing,
  );
  const result = createGhostOverlayData(ghost, loops, bpm, score);
  assert.deepEqual(
    result.events,
    overlay.you.map(({ kind, timeMs, loopIndex }) => ({
      kind,
      timeMs,
      position: timeMs / duration,
      loopIndex,
    })),
  );
});
