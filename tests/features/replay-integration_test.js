import assert from "node:assert/strict";
import {
  createReplaySelection,
  saveChallengeReplay,
} from "../../src/features/replay-integration.js";
import {
  getReplay,
  REPLAY_STORAGE_KEY,
} from "../../src/domain/replay-storage.js";
import { analyzeRuntimePerformance } from "../../src/features/performance-view.js";
import { compileScoreData } from "../../src/domain/score-compiler.js";
import {
  createEmptyProgress,
  evaluateAttempt,
} from "../../src/domain/bpm-challenge.js";
import {
  createLoopBoundary,
  createLoopState,
} from "../../src/domain/playback.js";
import { createStopObservation } from "../../src/domain/midi-mapping.js";

function backend() {
  const data = new Map([["scratchlab.ghost", "untouched"]]);
  const writes = [];
  return {
    data,
    writes,
    getItem: (key) => data.get(key) ?? null,
    setItem(key, value) {
      writes.push(key);
      data.set(key, value);
    },
  };
}

function completed() {
  const bpm = 80;
  const score = compileScoreData({
    name: "Replay",
    beat: "4/4",
    score: [["F", "B"]],
  });
  const duration = score.totalTicks * score.tickDurationSeconds * 60000 / bpm;
  const timeline = [];
  const loopStates = [1, 2].map((loopIndex) => {
    const time = 1000 + (loopIndex - 1) * duration;
    const boundary = (edge, time) =>
      createLoopBoundary({
        edge,
        time,
        loopIndex,
        sessionId: "replay-integration",
        phase: "recording",
        inputState: { currentDirection: "unknown", faderState: "open" },
      });
    const start = boundary("start", time);
    const end = boundary("end", time + duration);
    timeline.push(
      start,
      { type: "scratch", direction: "forward", time },
      { type: "scratch", direction: "backward", time: time + duration / 2 },
      createStopObservation({
        source: "mouse",
        lastMovementAt: time + duration / 2,
        timeoutMs: 180,
      }),
      end,
    );
    return createLoopState(start, end);
  });
  const analysis = analyzeRuntimePerformance(score, timeline, loopStates, bpm);
  const evaluated = evaluateAttempt(createEmptyProgress(), {
    bpm,
    accuracy: analysis.matching.accuracy,
    actualDurationMs: duration * 2,
    expectedDurationMs: duration * 2,
  });
  return {
    chartId: "baby-scratch",
    run: { courseStageId: null, bpm, startedAt: 1000, loopStates },
    analysis,
    outcome: { ok: true, ...evaluated },
    recordedAt: 1000 + duration * 2,
  };
}

Deno.test("Replay selection starts null and retrieves only the required runtime fields", () => {
  const storage = backend();
  const result = completed();
  saveChallengeReplay(result, storage);
  const selection = createReplaySelection(storage);
  assert.equal(selection.selectedReplay, null);
  const selected = selection.selectChart(result.chartId);
  assert.equal(selection.selectedReplay, selected);
  assert.deepEqual(selected, {
    chartId: result.chartId,
    bpm: result.run.bpm,
    replayContext: {
      recordingStartedAt: result.run.startedAt,
      recordingLoopCount: 2,
      loopStates: result.run.loopStates,
    },
    recordedTimeline: result.analysis.recordedTimeline,
  });
});

Deno.test("Replay selection clears an existing Replay when the next chart has none", () => {
  const storage = backend();
  saveChallengeReplay(completed(), storage);
  const selection = createReplaySelection(storage);
  selection.selectChart("baby-scratch");
  assert.equal(selection.selectChart("absent"), null);
  assert.equal(selection.selectedReplay, null);
});

Deno.test("Replay selection switches charts and rereads updated records on reselection", () => {
  const storage = backend();
  const a = completed();
  const b = completed();
  b.chartId = "chirp-scratch";
  b.run.bpm = b.analysis.bpm = 95;
  saveChallengeReplay(a, storage);
  saveChallengeReplay(b, storage);
  const selection = createReplaySelection(storage);
  assert.equal(selection.selectChart(a.chartId).bpm, 80);
  assert.equal(selection.selectChart(b.chartId).bpm, 95);
  a.run.bpm = a.analysis.bpm = 90;
  saveChallengeReplay(a, storage);
  assert.equal(selection.selectChart(a.chartId).bpm, 90);
  assert.equal(selection.selectedReplay.chartId, a.chartId);
});

Deno.test("corrupt or unsupported Replay clears stale selection without overwriting bytes", () => {
  const storage = backend();
  saveChallengeReplay(completed(), storage);
  const original = storage.getItem(REPLAY_STORAGE_KEY);
  const selection = createReplaySelection(storage);
  const warn = console.warn;
  let warnings = 0;
  console.warn = () => warnings++;
  try {
    for (
      const corrupt of [
        "invalid json",
        JSON.stringify({ version: 2, replays: {} }),
        JSON.stringify({ version: 1, replays: { "baby-scratch": {} } }),
      ]
    ) {
      storage.data.set(REPLAY_STORAGE_KEY, original);
      selection.selectChart("baby-scratch");
      storage.data.set(REPLAY_STORAGE_KEY, corrupt);
      assert.equal(selection.selectChart("baby-scratch"), null);
      assert.equal(selection.selectedReplay, null);
      assert.equal(storage.getItem(REPLAY_STORAGE_KEY), corrupt);
    }
    assert.equal(warnings, 3);
  } finally {
    console.warn = warn;
  }
});

Deno.test("Replay selection edits cannot mutate Storage and retrieval never writes", () => {
  const storage = backend();
  saveChallengeReplay(completed(), storage);
  const before = storage.getItem(REPLAY_STORAGE_KEY);
  const writes = storage.writes.length;
  const selection = createReplaySelection(storage);
  const selected = selection.selectChart("baby-scratch");
  selected.replayContext.loopStates[0].startTime = 0;
  selected.recordedTimeline[1].time = 0;
  selected.bpm = 999;
  assert.equal(storage.getItem(REPLAY_STORAGE_KEY), before);
  assert.equal(selection.selectChart("baby-scratch").bpm, 80);
  assert.equal(
    selection.selectedReplay.replayContext.loopStates[0].startTime,
    1000,
  );
  assert.equal(selection.selectedReplay.recordedTimeline[1].time, 1000);
  assert.equal(storage.writes.length, writes);
  assert.equal(createReplaySelection(storage).selectedReplay, null);
});

Deno.test("Replay read denial clears an existing selection and warns", () => {
  const storage = backend();
  saveChallengeReplay(completed(), storage);
  const selection = createReplaySelection(storage);
  selection.selectChart("baby-scratch");
  storage.getItem = () => {
    throw new Error("denied");
  };
  const warn = console.warn;
  let warnings = 0;
  console.warn = () => warnings++;
  try {
    assert.equal(selection.selectChart("chirp-scratch"), null);
    assert.equal(selection.selectedReplay, null);
    assert.equal(warnings, 1);
  } finally {
    console.warn = warn;
  }
});

Deno.test("cleared real v2 Challenge saves exact Replay context and Timeline retrievable by chart", () => {
  const result = completed();
  const before = structuredClone(result);
  const storage = backend();
  assert.equal(result.analysis.matching.accuracy, 100);
  assert.deepEqual(saveChallengeReplay(result, storage), { ok: true });
  assert.deepEqual(getReplay(result.chartId, storage), {
    version: 1,
    chartId: result.chartId,
    eventModelVersion: 2,
    bpm: result.run.bpm,
    recordedAt: result.recordedAt,
    replayContext: {
      recordingStartedAt: result.run.startedAt,
      recordingLoopCount: 2,
      loopStates: result.run.loopStates,
    },
    recordedTimeline: result.analysis.recordedTimeline,
  });
  assert.deepEqual(result, before);
  assert.deepEqual(storage.writes, [REPLAY_STORAGE_KEY]);
  assert.equal(storage.data.get("scratchlab.ghost"), "untouched");
});

Deno.test("uncleared interrupted ignored invalid or unsaved Challenge does not save Replay", () => {
  const storage = backend();
  const base = completed();
  const failed = evaluateAttempt(createEmptyProgress(), {
    bpm: 80,
    accuracy: 50,
    actualDurationMs: 1000,
    expectedDurationMs: 1000,
  });
  for (
    const outcome of [
      { ok: true, ...failed },
      null,
      { ok: false, reason: "write-failed" },
      { ok: true, result: { status: "ignored", valid: true, cleared: true } },
      { ok: true, result: { status: "counted", valid: false, cleared: true } },
    ]
  ) {
    assert.equal(saveChallengeReplay({ ...base, outcome }, storage).ok, false);
  }
  assert.deepEqual(storage.writes, []);
  assert.equal(getReplay(base.chartId, storage), null);
});

Deno.test("Beginner Course and absent run cannot save Replay", () => {
  const base = completed();
  const storage = backend();
  for (const run of [null, { ...base.run, courseStageId: "baby-scratch" }]) {
    assert.equal(saveChallengeReplay({ ...base, run }, storage).ok, false);
  }
  assert.deepEqual(storage.writes, []);
});

Deno.test("v1 invalid analysis missing Timeline and mismatched BPM reject Replay", () => {
  const base = completed();
  const storage = backend();
  for (
    const analysis of [
      null,
      {},
      { ...base.analysis, eventModelVersion: 1 },
      { ...base.analysis, matching: { initialStateValid: false } },
      { ...base.analysis, recordedTimeline: undefined },
      { ...base.analysis, recordedTimeline: [] },
      { ...base.analysis, bpm: 90 },
    ]
  ) {
    assert.equal(saveChallengeReplay({ ...base, analysis }, storage).ok, false);
  }
  assert.deepEqual(storage.writes, []);
});

Deno.test("missing or incomplete replayContext rejects Replay without replacing prior record", () => {
  const base = completed();
  const storage = backend();
  saveChallengeReplay(base, storage);
  const before = storage.getItem(REPLAY_STORAGE_KEY);
  for (
    const run of [
      { ...base.run, startedAt: undefined },
      { ...base.run, startedAt: 999 },
      { ...base.run, loopStates: undefined },
      { ...base.run, loopStates: [] },
      { ...base.run, loopStates: base.run.loopStates.slice(0, 1) },
      { ...base.run, loopStates: [null, null] },
    ]
  ) {
    assert.equal(saveChallengeReplay({ ...base, run }, storage).ok, false);
    assert.equal(storage.getItem(REPLAY_STORAGE_KEY), before);
  }
});

Deno.test("invalid Replay fields and events are rejected by Storage validation", () => {
  const base = completed();
  const storage = backend();
  for (
    const result of [
      { ...base, chartId: "" },
      { ...base, recordedAt: NaN },
      {
        ...base,
        analysis: {
          ...base.analysis,
          recordedTimeline: [{
            type: "scratch",
            direction: "forward",
            time: NaN,
          }],
        },
      },
    ]
  ) assert.equal(saveChallengeReplay(result, storage).ok, false);
  assert.deepEqual(storage.writes, []);
});

Deno.test("Replay write failure does not mutate successful Challenge result or Progress", () => {
  const result = completed();
  const before = structuredClone(result);
  const storage = backend();
  storage.setItem = () => {
    throw new Error("quota");
  };
  assert.deepEqual(saveChallengeReplay(result, storage), {
    ok: false,
    reason: "write-failed",
  });
  assert.deepEqual(saveChallengeReplay(result, null), {
    ok: false,
    reason: "unavailable",
  });
  assert.deepEqual(result, before);
  assert.equal(result.outcome.result.cleared, true);
});

Deno.test("each successful Challenge replaces its chart Replay without Ghost Best comparison", () => {
  const storage = backend();
  const first = completed();
  saveChallengeReplay(first, storage);
  const next = completed();
  next.recordedAt += 100;
  saveChallengeReplay(next, storage);
  assert.equal(getReplay(first.chartId, storage).recordedAt, next.recordedAt);
  assert.equal(storage.writes.length, 2);
});
