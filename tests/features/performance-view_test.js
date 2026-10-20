import assert from "node:assert/strict";
import { chartCatalog } from "../../src/data/chart-catalog.js";
import { compileScoreData } from "../../src/domain/score-compiler.js";
import {
  createEventCompressor,
  createStopObservation,
} from "../../src/domain/midi-mapping.js";
import {
  createLoopBoundary,
  createLoopState,
} from "../../src/domain/playback.js";
import {
  createPerformance,
  normalizePerformance,
} from "../../src/domain/performance.js";
import {
  analyzeRuntimePerformance,
  createPerformanceView,
} from "../../src/features/performance-view.js";

function fixture(id, initialFaderState = "open") {
  const definition = chartCatalog.find((item) => item.id === id);
  const chart = { ...definition, scoreData: compileScoreData(definition) };
  const bpm = 80;
  const tickMs = chart.scoreData.tickDurationSeconds * 60000 / bpm;
  const duration = chart.scoreData.totalTicks * tickMs;
  const compressor = createEventCompressor();
  if (initialFaderState !== "unknown") {
    compressor.accept({ type: "fader", state: initialFaderState, time: 0 });
  }
  const events = [];
  const loops = [];
  const feed = (event) => {
    const accepted = compressor.accept(event);
    if (accepted) events.push(accepted);
  };
  for (let take = 1; take <= 2; take++) {
    const startTime = 1000 + (take - 1) * duration;
    const boundary = (edge, time) =>
      createLoopBoundary({
        edge,
        time,
        sessionId: "integration",
        loopIndex: take,
        phase: "recording",
        inputState: compressor.getState(),
      });
    const start = boundary("start", startTime);
    for (const event of chart.scoreData.events) {
      if (event.keep) continue;
      const time = startTime + event.startTick * tickMs;
      feed({
        type: "scratch",
        direction: event.direction === "F" ? "forward" : "backward",
        time,
      });
      for (let cut = 0; cut < event.cutCount; cut++) {
        const cutTime = time +
          event.durationTicks * tickMs * (cut + 1) / (event.cutCount + 1);
        feed({ type: "fader", state: "closed", time: cutTime });
        feed({ type: "fader", state: "open", time: cutTime });
      }
    }
    const stop = createStopObservation({
      source: "mouse",
      lastMovementAt: startTime + duration - 200,
      timeoutMs: 180,
    });
    compressor.observeStop(stop);
    events.push(stop);
    loops.push(createLoopState(start, boundary("end", startTime + duration)));
  }
  const performance = createPerformance(
    events.filter((event) => event.type !== "stop"),
    {
      startedAt: 1000,
      endedAt: 1000 + duration * 2,
      loopEnds: [duration],
    },
  );
  return { chart, events, loops, bpm, performance };
}

function viewFor(performance, chart) {
  const calls = [];
  const view = createPerformanceView({
    getSelectedChart: () => chart,
    getLatestPerformance: () => performance,
    performanceUi: { renderPerformanceAnalysis: (...args) => calls.push(args) },
  });
  return { view, calls };
}

for (const id of ["baby-scratch", "chirp-scratch", "one-click-flare-orbit"]) {
  Deno.test(`runtime v2: ${id} shares 100% matching, timing and overlay without changing saved data`, () => {
    const { chart, events, loops, bpm, performance } = fixture(id);
    const before = JSON.stringify(performance);
    const { view, calls } = viewFor(performance, chart);
    const result = view.setRuntime(performance, chart, events, loops, bpm);
    assert.equal(result.matching.accuracy, 100);
    assert.equal(result.matching.initialStateValid, true);
    assert.equal(view.analyzeForChart(performance, chart), result.matching);
    assert.equal(view.analyzeTimingForChart(performance, chart), result.timing);
    assert.equal(view.getAnalysis(performance, chart).overlay, result.overlay);
    assert.equal(result.overlay.counts.missing, result.matching.missing);
    assert.equal(result.overlay.counts.extra, result.matching.extra);
    assert.equal(
      result.overlay.counts.measuredCount,
      result.timing.measuredCount,
    );
    assert.equal(
      result.timing.measuredCount,
      result.matching.pairs.filter((pair) => pair.timingEligible).length,
    );
    view.renderPerformanceAnalysis();
    assert.equal(calls[0][0], result.matching);
    assert.equal(JSON.stringify(performance), before);
    assert.equal(performance.version, 1);
    assert.equal(
      view.getAnalysis(normalizePerformance(performance), chart),
      null,
    );
    assert.equal(
      view.getAnalysis(performance, {
        ...chart,
        scoreData: compileScoreData(chart),
      }),
      null,
    );
  });
}

Deno.test("runtime v2: old recordings remain visible but are not silently re-scored", () => {
  const { chart, performance } = fixture("baby-scratch");
  const { view, calls } = viewFor(performance, chart);
  assert.equal(view.analyzeForChart(performance, chart), null);
  assert.equal(view.analyzeTimingForChart(performance, chart), null);
  view.renderPerformanceAnalysis();
  assert.equal(calls[0][0], null);
  assert.match(calls[0][2], /再挑戦/);
});

Deno.test("runtime v2: truncated recordings cannot receive a complete sidecar score", () => {
  const { chart, events, loops, bpm, performance } = fixture("baby-scratch");
  performance.truncated = true;
  const { view, calls } = viewFor(performance, chart);
  assert.equal(view.setRuntime(performance, chart, events, loops, bpm), null);
  assert.equal(view.analyzeForChart(performance, chart), null);
  view.renderPerformanceAnalysis();
  assert.match(calls[0][2], /上限/);
});

Deno.test("runtime v2: closed and unknown initial states never become valid from later input", () => {
  for (const state of ["closed", "unknown"]) {
    const { chart, events, loops, bpm, performance } = fixture(
      "baby-scratch",
      state,
    );
    const { view } = viewFor(performance, chart);
    const result = view.setRuntime(performance, chart, events, loops, bpm);
    assert.equal(result.matching.accuracy, 100);
    assert.equal(result.matching.initialStateValid, false);
    assert.equal(result.overlay.counts.initialStateErrors, 2);
  }
});

Deno.test("runtime v2: live preview only judges elapsed events, not future Missing", () => {
  const { chart, events, loops, bpm } = fixture("baby-scratch");
  const loop = { ...loops[0], endTime: loops[0].startTime + 1 };
  const result = analyzeRuntimePerformance(
    chart.scoreData,
    events.filter((event) => event.time < loop.endTime),
    [loop],
    bpm,
    0,
  );
  assert.equal(result.expected.length, 1);
  assert.equal(result.matching.missing, 0);
  assert.equal(result.overlay.counts.measuredCount, 1);
});
