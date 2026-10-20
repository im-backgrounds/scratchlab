import assert from "node:assert/strict";
import { createReplayPlayback } from "../../src/domain/replay-playback.js";
import { createStopObservation } from "../../src/domain/midi-mapping.js";
import { createLoopBoundary } from "../../src/domain/playback.js";
import { getReplay, saveReplay } from "../../src/domain/replay-storage.js";
import { createReplaySelection } from "../../src/features/replay-integration.js";

function record() {
  const boundary = (edge, loopIndex, time) =>
    createLoopBoundary({
      edge,
      loopIndex,
      time,
      phase: "recording",
      sessionId: "playback",
      inputState: { currentDirection: "unknown", faderState: "open" },
    });
  return {
    version: 1,
    chartId: "baby-scratch",
    eventModelVersion: 2,
    bpm: 80,
    recordedAt: 4000,
    replayContext: {
      recordingStartedAt: 1000,
      recordingLoopCount: 2,
      loopStates: [
        { loopIndex: 1, startTime: 1000, endTime: 2000, phase: "recording" },
        { loopIndex: 2, startTime: 2000, endTime: 3000, phase: "recording" },
      ],
    },
    recordedTimeline: [
      boundary("start", 1, 1000),
      { type: "scratch", direction: "forward", time: 1000 },
      { type: "scratch", direction: "backward", time: 1500 },
      { type: "fader", state: "closed", time: 1600 },
      { type: "fader", state: "open", time: 1700 },
      createStopObservation({
        source: "mouse",
        lastMovementAt: 1700,
        timeoutMs: 180,
      }),
      boundary("end", 1, 2000),
      boundary("start", 2, 2000),
      { type: "scratch", direction: "forward", time: 2500 },
      boundary("end", 2, 3000),
    ],
  };
}

Deno.test("Replay playback starts and resets at zero including events at the start instant", () => {
  const input = record();
  const model = createReplayPlayback(input);
  const initial = {
    currentTime: 0,
    currentLoop: 1,
    progress: 0,
    visibleEvents: input.recordedTimeline.slice(0, 2),
  };
  assert.deepEqual(model.getState(), initial);
  model.seek(1500);
  assert.deepEqual(model.reset(), initial);
  assert.deepEqual(model.getState(), initial);
});

Deno.test("Replay seek updates at 0 500 and 1000 ms and supports backward seeking", () => {
  const model = createReplayPlayback(record());
  for (const time of [0, 500, 1000, 500]) {
    assert.equal(model.seek(time).currentTime, time);
    assert.equal(model.getState().progress, time / 2000);
  }
  assert.equal(model.getState().visibleEvents.length, 3);
});

Deno.test("Replay half-open boundaries switch to the next loop and end stays in the final loop", () => {
  const model = createReplayPlayback(record());
  assert.equal(model.seek(999).currentLoop, 1);
  assert.equal(model.seek(1000).currentLoop, 2);
  assert.equal(model.seek(1999).currentLoop, 2);
  assert.deepEqual(model.seek(2000), {
    currentTime: 2000,
    currentLoop: 2,
    progress: 1,
    visibleEvents: record().recordedTimeline,
  });
});

Deno.test("Replay seek clamps finite out-of-range times and progress stays within zero and one", () => {
  const model = createReplayPlayback(record());
  assert.equal(model.seek(-500).currentTime, 0);
  assert.equal(model.getState().progress, 0);
  assert.equal(model.seek(10000).currentTime, 2000);
  assert.equal(model.getState().progress, 1);
  assert.equal(model.seek(0.5).currentTime, 0.5);
});

Deno.test("Replay gap has no current loop and is not filled by adjacent loops", () => {
  const input = record();
  input.replayContext.loopStates[1].startTime = 2200;
  const model = createReplayPlayback(input);
  assert.equal(model.seek(1000).currentLoop, null);
  assert.equal(model.seek(1100).currentLoop, null);
  assert.equal(model.seek(1200).currentLoop, 2);
});

Deno.test("Replay visible events retain original timestamps all event types and equal-time order", () => {
  const input = record();
  const model = createReplayPlayback(input);
  assert.deepEqual(
    model.seek(1000).visibleEvents,
    input.recordedTimeline.slice(0, 8),
  );
  assert.equal(model.seek(500).visibleEvents.at(-1).time, 1500);
  assert.deepEqual(model.seek(2000).visibleEvents, input.recordedTimeline);
});

Deno.test("Replay ignores demo history and events outside recording range", () => {
  const input = record();
  input.replayContext.loopStates.unshift({
    phase: "demo",
    loopIndex: 0,
    startTime: 0,
    endTime: 1000,
  });
  input.recordedTimeline.unshift({
    type: "scratch",
    direction: "forward",
    time: 500,
  });
  input.recordedTimeline.push({
    type: "scratch",
    direction: "backward",
    time: 3100,
  });
  const model = createReplayPlayback(input);
  assert.deepEqual(model.seek(2000).visibleEvents, record().recordedTimeline);
  assert.equal(model.reset().currentLoop, 1);
});

Deno.test("Replay playback snapshots inputs and returns detached event data", () => {
  const input = structuredClone(record());
  const before = structuredClone(input);
  const model = createReplayPlayback(input);
  model.seek(1000);
  model.reset();
  assert.deepEqual(input, before);
  input.recordedTimeline[0].time = 999999;
  input.replayContext.loopStates[1].loopIndex = 99;
  const state = model.seek(2000);
  assert.equal(state.currentLoop, 2);
  state.visibleEvents[0].time = 999999;
  assert.deepEqual(model.getState().visibleEvents, before.recordedTimeline);
});

Deno.test("Replay playback same input and seek position always produce the same state", () => {
  const first = createReplayPlayback(record());
  const second = createReplayPlayback(record());
  first.seek(1999);
  for (const time of [0, 500, 1000, 2000, 20]) {
    assert.deepEqual(first.seek(time), second.seek(time));
    assert.deepEqual(first.getState(), first.getState());
  }
});

Deno.test("Replay invalid seek throws TypeError without moving the cursor", () => {
  const model = createReplayPlayback(record());
  const before = model.seek(500);
  for (
    const value of [NaN, Infinity, -Infinity, "500", null, undefined, {}, 1n]
  ) {
    assert.throws(() => model.seek(value), TypeError);
    assert.deepEqual(model.getState(), before);
  }
});

Deno.test("Replay playback rejects incomplete or inconsistent playback input", () => {
  const input = record();
  for (
    const candidate of [
      null,
      {},
      { ...input, bpm: 0 },
      { ...input, recordedTimeline: undefined },
      { ...input, recordedTimeline: [...input.recordedTimeline].reverse() },
      {
        ...input,
        replayContext: { ...input.replayContext, recordingLoopCount: 3 },
      },
      { ...input, replayContext: { ...input.replayContext, loopStates: [] } },
      {
        ...input,
        replayContext: { ...input.replayContext, recordingStartedAt: NaN },
      },
    ]
  ) assert.throws(() => createReplayPlayback(candidate), TypeError);
});

Deno.test("Replay playback accepts empty Timeline and Storage or selectedReplay records", () => {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
  const input = record();
  assert.deepEqual(saveReplay(input, storage), { ok: true });
  const stored = createReplayPlayback(getReplay(input.chartId, storage));
  const selected = createReplaySelection(storage).selectChart(input.chartId);
  assert.deepEqual(
    createReplayPlayback(selected).seek(1000),
    stored.seek(1000),
  );
  input.recordedTimeline = [];
  assert.deepEqual(createReplayPlayback(input).seek(2000).visibleEvents, []);
});
