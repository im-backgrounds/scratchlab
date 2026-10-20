import assert from "node:assert/strict";
import { createReplayController } from "../../src/domain/replay-controller.js";
import { createReplayPlayback } from "../../src/domain/replay-playback.js";

function setup() {
  const record = {
    chartId: "baby-scratch",
    bpm: 80,
    replayContext: {
      recordingStartedAt: 1000,
      recordingLoopCount: 2,
      loopStates: [
        { loopIndex: 1, phase: "recording", startTime: 1000, endTime: 2000 },
        { loopIndex: 2, phase: "recording", startTime: 2000, endTime: 3000 },
      ],
    },
    recordedTimeline: [
      { type: "scratch", direction: "forward", time: 1000 },
      { type: "scratch", direction: "backward", time: 1500 },
      { type: "fader", state: "closed", time: 2000 },
      { type: "fader", state: "open", time: 3000 },
    ],
  };
  const playback = createReplayPlayback(record);
  return { record, playback, controller: createReplayController(playback) };
}

Deno.test("Replay Controller starts paused and play alone never advances time", () => {
  const { controller, playback } = setup();
  assert.deepEqual(controller.getState(), {
    isPlaying: false,
    ...playback.getState(),
  });
  assert.equal(controller.tick(100).currentTime, 0);
  assert.equal(controller.play().isPlaying, true);
  assert.equal(controller.play().currentTime, 0);
  assert.equal(controller.getState().currentTime, 0);
  assert.equal(controller.tick(0).currentTime, 0);
  assert.equal(controller.tick(16).currentTime, 16);
  assert.equal(controller.tick(100).currentTime, 116);
});

Deno.test("Replay Controller pause keeps position and resume continues from that position", () => {
  const { controller } = setup();
  controller.play();
  controller.tick(500);
  const paused = controller.pause();
  assert.equal(paused.isPlaying, false);
  assert.equal(paused.currentTime, 500);
  assert.deepEqual(controller.tick(1000), paused);
  controller.play();
  assert.equal(controller.tick(100).currentTime, 600);
});

Deno.test("Replay Controller stop resets time loop progress and visible events", () => {
  const { controller } = setup();
  const initial = controller.getState();
  controller.play();
  controller.tick(1500);
  assert.deepEqual(controller.stop(), initial);
  assert.deepEqual(controller.stop(), initial);
  assert.deepEqual(controller.tick(100), initial);
});

Deno.test("Replay Controller seek delegates clamping and preserves playing or paused state", () => {
  const { controller, playback } = setup();
  assert.equal(controller.seek(500).isPlaying, false);
  assert.equal(controller.getState().currentTime, 500);
  controller.play();
  assert.equal(controller.seek(1000).isPlaying, true);
  assert.equal(controller.getState().currentLoop, 2);
  assert.deepEqual(playback.getState(), {
    currentTime: 1000,
    currentLoop: 2,
    progress: 0.5,
    visibleEvents: setup().record.recordedTimeline.slice(0, 3),
  });
  assert.equal(controller.seek(-10).currentTime, 0);
  assert.equal(controller.getState().isPlaying, true);
});

for (const delta of [2000, 3000, Number.MAX_VALUE]) {
  Deno.test(`Replay Controller tick ${delta} clamps at end and stops without rewinding`, () => {
    const { controller } = setup();
    controller.play();
    controller.tick(500);
    const end = controller.tick(delta);
    assert.equal(end.currentTime, 2000);
    assert.equal(end.currentLoop, 2);
    assert.equal(end.progress, 1);
    assert.equal(end.isPlaying, false);
    assert.equal(end.visibleEvents.length, 4);
    assert.deepEqual(controller.tick(100), end);
    assert.deepEqual(controller.play(), end);
    controller.seek(500);
    controller.play();
    assert.equal(controller.tick(100).currentTime, 600);
    controller.stop();
    controller.play();
    assert.equal(controller.tick(100).currentTime, 100);
  });
}

Deno.test("Replay Controller seek to the end stops and retains final position", () => {
  const { controller } = setup();
  controller.play();
  const end = controller.seek(9999);
  assert.equal(end.isPlaying, false);
  assert.equal(end.currentTime, 2000);
  assert.equal(end.currentLoop, 2);
});

Deno.test("Replay Controller invalid deltas or seeks throw without changing state", () => {
  const { controller } = setup();
  controller.play();
  const before = controller.tick(500);
  for (
    const delta of [-1, NaN, Infinity, -Infinity, "16", null, undefined, {}, 1n]
  ) {
    assert.throws(() => controller.tick(delta), TypeError);
    assert.deepEqual(controller.getState(), before);
  }
  for (const time of [NaN, Infinity, -Infinity, "500", null]) {
    assert.throws(() => controller.seek(time), TypeError);
    assert.deepEqual(controller.getState(), before);
  }
  controller.pause();
  assert.throws(() => controller.tick(-1), TypeError);
});

Deno.test("Replay Controller repeated commands and ticks are reproducible", () => {
  const first = setup().controller;
  const second = setup().controller;
  for (
    const [method, value] of [
      ["play"],
      ["tick", 16],
      ["tick", 100],
      ["seek", 500],
      ["pause"],
      ["tick", 100],
      ["play"],
      ["tick", 600],
      ["stop"],
      ["play"],
      ["tick", 2000],
    ]
  ) {
    assert.deepEqual(first[method](value), second[method](value));
    assert.deepEqual(first.getState(), second.getState());
  }
});

Deno.test("Replay Controller leaves input prior states and Playback snapshots intact", () => {
  const { controller, playback, record } = setup();
  const input = structuredClone(record);
  const initial = playback.getState();
  controller.play();
  const state = controller.tick(1000);
  state.visibleEvents[0].time = 99999;
  state.currentLoop = 99;
  assert.equal(playback.getState().visibleEvents[0].time, 1000);
  assert.equal(controller.getState().currentLoop, 2);
  assert.deepEqual(record, input);
  assert.equal(initial.currentTime, 0);
  assert.equal(initial.visibleEvents.length, 1);
});

Deno.test("Replay Controller construction preserves a prepositioned model and rejects missing API", () => {
  const { playback } = setup();
  playback.seek(500);
  assert.equal(createReplayController(playback).getState().currentTime, 500);
  for (const model of [null, {}, { getState() {} }]) {
    assert.throws(() => createReplayController(model), TypeError);
  }
});
