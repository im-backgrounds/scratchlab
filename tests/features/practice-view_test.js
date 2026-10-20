import assert from "node:assert/strict";
import { compileScoreData } from "../../src/domain/score-compiler.js";
import { createPracticeView } from "../../src/features/practice-view.js";
import { createStopObservation } from "../../src/domain/midi-mapping.js";

function setup(getGhostOverlayData = () => null) {
  const chart = {
    id: "test",
    scoreData: compileScoreData({
      name: "test",
      beat: "4/4",
      score: [["F", "B"]],
    }),
  };
  const state = { isPlaying: true, isBuilderPlayback: false, bpm: 60 };
  const snapshot = {
    startedAt: 1000,
    stoppedAt: 1001,
    events: [{ type: "scratch", direction: "forward", time: 1000 }],
    loopState: {
      sessionId: "test",
      loopIndex: 1,
      phase: "recording",
      startTime: 1000,
      startDirection: "unknown",
      startFaderState: "open",
    },
  };
  const calls = [];
  const completed = { completed: true };
  const view = createPracticeView({
    state,
    getSelectedChart: () => chart,
    getPlaybackSnapshot: () => snapshot,
    getLatestPerformance: () => ({}),
    getAnalysis: () => completed,
    getGhostOverlayData,
    performanceUi: { renderControllerOverlay: (...args) => calls.push(args) },
  });

  return { chart, state, snapshot, calls, completed, view };
}

Deno.test("practice passes Ghost data only to rendering in live, demo and finished views", () => {
  const ghost = {
    events: [{ kind: "forward", position: 0, timeMs: 0, loopIndex: 1 }],
  };
  const { state, snapshot, view, calls } = setup(() => ghost);
  view.renderControllerOverlay();
  assert.equal(calls.at(-1)[4], ghost);
  assert.equal(Object.hasOwn(calls.at(-1)[1], "ghost"), false);
  snapshot.loopState.phase = "demo";
  view.renderControllerOverlay();
  assert.equal(calls.at(-1)[4], ghost);
  state.isPlaying = false;
  snapshot.startedAt = null;
  snapshot.events = [];
  view.renderControllerOverlay();
  assert.equal(calls.at(-1)[4], ghost);
});

Deno.test("practice v2: demo displays the expected timeline without Missing or initial-state errors", () => {
  const { snapshot, calls, view } = setup();
  snapshot.loopState.phase = "demo";
  snapshot.loopState.startFaderState = "unknown";
  view.renderControllerOverlay();
  assert.equal(calls[0][1], null);
  assert.equal(calls[0][2].isDemo, true);
  assert.equal(calls[0][3].length, 2);
});

Deno.test("practice v2: live sample retains future strokes without marking them Missing", () => {
  const { calls, view } = setup();
  view.renderControllerOverlay();
  const [, bundle, , expected] = calls[0];
  assert.equal(expected.length, 2);
  assert.equal(bundle.matching.missing, 0);
  assert.equal(
    bundle.timing.measuredCount,
    bundle.overlay.counts.measuredCount,
  );
});

Deno.test("practice v2: stopped preview uses the frozen position rather than the wall clock", () => {
  const { state, calls, view } = setup();
  state.isPlaying = false;
  view.renderControllerOverlay();
  assert.equal(calls[0][1].matching.expectedCount, 1);
  assert.equal(calls[0][2].isPlaying, false);
});

Deno.test("practice v2: delayed Stop timestamps are sorted before shared matching", () => {
  const { snapshot, calls, view } = setup();
  snapshot.stoppedAt = 1100;
  snapshot.events.push(
    { type: "fader", state: "closed", time: 1090 },
    createStopObservation({
      source: "mouse",
      lastMovementAt: 900,
      timeoutMs: 180,
    }),
  );
  view.renderControllerOverlay();
  assert.equal(calls[0][1].overlay.counts.extra, 1);
  assert.equal(calls[0][1].overlay.you.length, 2);
});

Deno.test("practice v2: finished results pass the same cached bundle to the renderer", () => {
  const { state, snapshot, completed, calls, view } = setup();
  state.isPlaying = false;
  snapshot.startedAt = null;
  snapshot.events = [];
  view.renderControllerOverlay();
  assert.equal(calls[0][1], completed);
});
