import assert from "node:assert/strict";
import { saveChallengeGhost } from "../../src/features/ghost-integration.js";
import {
  getBestRun,
  GHOST_STORAGE_KEY,
} from "../../src/domain/ghost-storage.js";
import {
  createEmptyProgress,
  evaluateAttempt,
} from "../../src/domain/bpm-challenge.js";
import { analyzeRuntimePerformance } from "../../src/features/performance-view.js";
import { compileScoreData } from "../../src/domain/score-compiler.js";

function fakeStorage() {
  const data = new Map([["scratchlab.performance", "untouched"]]);
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

function completed(accuracy = 95, timingAccuracy = 80) {
  const evaluated = evaluateAttempt(createEmptyProgress(), {
    bpm: 80,
    accuracy,
    actualDurationMs: 1000,
    expectedDurationMs: 1000,
  });
  return {
    chartId: "baby-scratch",
    run: { courseStageId: null, bpm: 80 },
    analysis: {
      eventModelVersion: 2,
      bpm: 80,
      matching: { accuracy, initialStateValid: true },
      timing: { timingAccuracy },
      recordedTimeline: [
        { type: "scratch", direction: "forward", time: 1000 },
        { type: "fader", state: "closed", time: 1100 },
        { type: "fader", state: "open", time: 1200 },
        { type: "scratch", direction: "backward", time: 1300 },
      ],
    },
    outcome: { ok: true, ...evaluated },
    recordedAt: 1760000000000,
  };
}

Deno.test("cleared BPM Challenge saves a Ghost retrievable with getBestRun", () => {
  const storage = fakeStorage();
  const result = completed();
  const before = structuredClone(result);
  assert.deepEqual(saveChallengeGhost(result, storage), {
    ok: true,
    updated: true,
  });
  assert.deepEqual(getBestRun(result.chartId, storage), {
    chartId: result.chartId,
    eventModelVersion: 2,
    bpm: 80,
    accuracy: 95,
    timingAccuracy: 80,
    recordedAt: result.recordedAt,
    recordedTimeline: result.analysis.recordedTimeline,
  });
  assert.deepEqual(result, before);
  assert.equal(storage.data.get("scratchlab.performance"), "untouched");
  assert.deepEqual(storage.writes, [GHOST_STORAGE_KEY]);
});

Deno.test("cleared Challenge Ghost improves from 95 to 97 and preserves a better run", () => {
  const storage = fakeStorage();
  saveChallengeGhost(completed(95), storage);
  assert.equal(saveChallengeGhost(completed(97), storage).updated, true);
  assert.equal(saveChallengeGhost(completed(96, 100), storage).updated, false);
  assert.equal(getBestRun("baby-scratch", storage).accuracy, 97);
  assert.equal(storage.writes.length, 2);
});

Deno.test("equal 100 Accuracy improves Timing from 80 to 85, then prefers recency", () => {
  const storage = fakeStorage();
  saveChallengeGhost(completed(100, 80), storage);
  assert.equal(saveChallengeGhost(completed(100, 85), storage).updated, true);
  const newer = { ...completed(100, 85), recordedAt: 1760000000001 };
  assert.equal(saveChallengeGhost(newer, storage).updated, true);
  assert.equal(saveChallengeGhost(completed(100, 84), storage).updated, false);
  assert.equal(
    getBestRun("baby-scratch", storage).recordedAt,
    newer.recordedAt,
  );
  assert.equal(getBestRun("baby-scratch", storage).timingAccuracy, 85);
});

Deno.test("uncleared, interrupted, ignored, invalid, and unsaved Challenge results do not write Ghosts", () => {
  const storage = fakeStorage();
  const baseline = completed();
  for (
    const outcome of [
      completed(89).outcome,
      null,
      { ok: false, reason: "write-failed" },
      { ok: true, result: { status: "ignored" } },
      { ok: true, result: { status: "counted", valid: false, cleared: false } },
    ]
  ) {
    assert.equal(
      saveChallengeGhost({ ...baseline, outcome }, storage).ok,
      false,
    );
  }
  assert.equal(storage.writes.length, 0);
  assert.equal(getBestRun("baby-scratch", storage), null);
});

Deno.test("Beginner Course and missing run context never save a Ghost", () => {
  const storage = fakeStorage();
  for (const run of [null, { bpm: 80, courseStageId: "baby-scratch" }]) {
    assert.equal(
      saveChallengeGhost({ ...completed(), run }, storage).ok,
      false,
    );
  }
  assert.equal(storage.writes.length, 0);
});

Deno.test("v1, missing or failed analysis, missing timeline and invalid initial state are rejected", () => {
  const storage = fakeStorage();
  const base = completed();
  for (
    const analysis of [
      null,
      {},
      { ...base.analysis, eventModelVersion: 1 },
      { ...base.analysis, recordedTimeline: undefined },
      { ...base.analysis, recordedTimeline: [] },
      { ...base.analysis, matching: null },
      {
        ...base.analysis,
        matching: { accuracy: 100, initialStateValid: false },
      },
      { ...base.analysis, timing: null },
      { ...base.analysis, timing: {} },
      { ...base.analysis, bpm: 90 },
    ]
  ) {
    assert.equal(saveChallengeGhost({ ...base, analysis }, storage).ok, false);
  }
  assert.equal(storage.writes.length, 0);
});

Deno.test("missing chartId and invalid timelines do not overwrite an existing Ghost", () => {
  const storage = fakeStorage();
  saveChallengeGhost(completed(), storage);
  const before = storage.data.get(GHOST_STORAGE_KEY);
  for (const chartId of [undefined, null, ""]) {
    assert.equal(
      saveChallengeGhost({ ...completed(100), chartId }, storage).ok,
      false,
    );
  }
  const result = completed(100);
  result.analysis.recordedTimeline[0].time = NaN;
  assert.equal(saveChallengeGhost(result, storage).ok, false);
  assert.equal(storage.data.get(GHOST_STORAGE_KEY), before);
});

Deno.test("Ghost persistence failure is explicit and does not mutate the Challenge result", () => {
  const result = completed();
  const before = structuredClone(result);
  assert.deepEqual(saveChallengeGhost(result, null), {
    ok: false,
    reason: "unavailable",
  });
  const storage = fakeStorage();
  storage.setItem = () => {
    throw new Error("quota");
  };
  assert.deepEqual(saveChallengeGhost(result, storage), {
    ok: false,
    reason: "write-failed",
  });
  assert.deepEqual(result, before);
});

Deno.test("real v2 analysis supplies the exact shared accuracy, timing and recorded timeline", () => {
  const storage = fakeStorage();
  const result = completed();
  const score = compileScoreData({
    name: "Ghost integration",
    beat: "4/4",
    score: [["F", "B"]],
  });
  const tickMs = score.tickDurationSeconds * 60000 / 80;
  const duration = score.totalTicks * tickMs;
  const loops = [{
    sessionId: "ghost-integration",
    loopIndex: 1,
    phase: "recording",
    startTime: 1000,
    endTime: 1000 + duration,
    startDirection: "unknown",
    startFaderState: "open",
  }];
  const recorded = [
    { type: "scratch", direction: "forward", time: 1000 },
    { type: "scratch", direction: "backward", time: 1000 + duration / 2 },
    {
      type: "stop",
      reason: "inactivity",
      source: "mouse",
      lastMovementAt: 1000 + duration / 2,
      timeoutMs: 180,
      time: 1180 + duration / 2,
    },
  ];
  result.analysis = analyzeRuntimePerformance(score, recorded, loops, 80);
  assert.equal(result.analysis.eventModelVersion, 2);
  assert.equal(saveChallengeGhost(result, storage).updated, true);
  const ghost = getBestRun(result.chartId, storage);
  assert.equal(ghost.accuracy, result.analysis.matching.accuracy);
  assert.equal(ghost.timingAccuracy, result.analysis.timing.timingAccuracy);
  assert.deepEqual(ghost.recordedTimeline, recorded.slice(0, 2));
});

Deno.test("cleared results may save with null Timing Accuracy", () => {
  const storage = fakeStorage();
  const result = completed(100, null);
  assert.equal(saveChallengeGhost(result, storage).updated, true);
  assert.equal(getBestRun(result.chartId, storage).timingAccuracy, null);
});
