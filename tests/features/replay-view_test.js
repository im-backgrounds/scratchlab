import assert from "node:assert/strict";
import { createReplayView } from "../../src/features/replay-view.js";

function record() {
  return {
    chartId: "baby-scratch",
    bpm: 80,
    replayContext: {
      recordingStartedAt: 1000,
      recordingLoopCount: 2,
      loopStates: [
        { phase: "recording", loopIndex: 1, startTime: 1000, endTime: 2000 },
        { phase: "recording", loopIndex: 2, startTime: 2000, endTime: 3000 },
      ],
    },
    recordedTimeline: [{ type: "scratch", direction: "forward", time: 1000 }],
  };
}

function setup() {
  const calls = [];
  const frames = new Map();
  let time = 0;
  let next = 1;
  let controls;
  const view = createReplayView({
    replayUi: {
      bindReplay: (handlers) => {
        controls = handlers;
      },
      renderReplay: (...args) => calls.push(args),
    },
    now: () => time,
    requestFrame: (callback) => {
      const id = next++;
      frames.set(id, callback);
      return id;
    },
    cancelFrame: (id) => frames.delete(id),
  });
  function advance(delta, flush = true) {
    time += delta;
    if (!flush) return;
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(time));
  }
  return { view, calls, frames, controls, advance };
}

Deno.test("Replay Viewer absent record renders disabled state and controls schedule nothing", () => {
  const { view, controls, calls, frames } = setup();
  view.setReplay(null);
  controls.onPlay();
  controls.onPause();
  controls.onStop();
  controls.onSeek(0.5);
  assert.equal(calls.at(-1)[0], null);
  assert.equal(frames.size, 0);
});

Deno.test("Replay Seek Bar converts progress into recording-relative ms while paused", () => {
  const { view, controls, calls, frames } = setup();
  view.setReplay(record());
  controls.onSeek(0.25);
  assert.deepEqual(calls.at(-1)[0], {
    isPlaying: false,
    currentTime: 500,
    currentLoop: 1,
    progress: 0.25,
  });
  controls.onSeek(0.5);
  assert.equal(calls.at(-1)[0].currentTime, 1000);
  assert.equal(calls.at(-1)[0].currentLoop, 2);
  controls.onSeek(0);
  assert.equal(calls.at(-1)[0].currentTime, 0);
  assert.equal(frames.size, 0);
});

Deno.test("Replay seek during play resets frame timing and ignores the replaced callback", () => {
  const { view, controls, calls, frames, advance } = setup();
  view.setReplay(record());
  controls.onPlay();
  advance(100);
  const stale = [...frames.values()][0];
  advance(50, false);
  controls.onSeek(0.5);
  assert.equal(calls.at(-1)[0].isPlaying, true);
  assert.equal(calls.at(-1)[0].currentTime, 1000);
  stale(150);
  assert.equal(frames.size, 1);
  advance(50);
  assert.equal(calls.at(-1)[0].currentTime, 1050);
});

Deno.test("Replay seek to end stops and seek back enables explicit resume", () => {
  const { view, controls, calls, frames, advance } = setup();
  view.setReplay(record());
  controls.onPlay();
  controls.onSeek(1);
  assert.deepEqual(calls.at(-1)[0], {
    isPlaying: false,
    currentTime: 2000,
    currentLoop: 2,
    progress: 1,
  });
  assert.equal(frames.size, 0);
  controls.onSeek(0.25);
  assert.equal(calls.at(-1)[0].isPlaying, false);
  controls.onPlay();
  advance(100);
  assert.equal(calls.at(-1)[0].currentTime, 600);
  controls.onStop();
  assert.equal(calls.at(-1)[0].progress, 0);
});

Deno.test("Replay seek uses final boundary including gaps and rejects invalid progress", () => {
  const { view, controls, calls } = setup();
  const replay = record();
  replay.replayContext.loopStates[1].startTime = 2200;
  view.setReplay(replay);
  controls.onSeek(0.55);
  assert.equal(calls.at(-1)[0].currentTime, 1100);
  assert.equal(calls.at(-1)[0].currentLoop, null);
  const before = calls.length;
  for (const value of [NaN, Infinity, -1, 1.1, "0.5"]) {
    assert.throws(() => controls.onSeek(value), TypeError);
  }
  assert.equal(calls.length, before);
});

Deno.test("Replay Viewer displays initial state without exposing visibleEvents", () => {
  const { view, calls } = setup();
  view.setReplay(record());
  assert.deepEqual(calls.at(-1)[0], {
    isPlaying: false,
    currentTime: 0,
    currentLoop: 1,
    progress: 0,
  });
});

Deno.test("Replay Viewer Play ticks progress Pause freezes and Stop resets", () => {
  const { view, controls, calls, frames, advance } = setup();
  view.setReplay(record());
  controls.onPlay();
  controls.onPlay();
  assert.equal(frames.size, 1);
  advance(500);
  assert.equal(calls.at(-1)[0].currentTime, 500);
  assert.equal(calls.at(-1)[0].progress, 0.25);
  controls.onPause();
  advance(500);
  assert.equal(calls.at(-1)[0].currentTime, 500);
  assert.equal(frames.size, 0);
  controls.onPlay();
  advance(500);
  assert.equal(calls.at(-1)[0].currentTime, 1000);
  assert.equal(calls.at(-1)[0].currentLoop, 2);
  controls.onStop();
  assert.deepEqual(calls.at(-1)[0], {
    isPlaying: false,
    currentTime: 0,
    currentLoop: 1,
    progress: 0,
  });
  assert.equal(frames.size, 0);
});

Deno.test("Replay Viewer end stops frame scheduling and does not auto rewind", () => {
  const { view, controls, calls, frames, advance } = setup();
  view.setReplay(record());
  controls.onPlay();
  advance(3000);
  assert.deepEqual(calls.at(-1)[0], {
    isPlaying: false,
    currentTime: 2000,
    currentLoop: 2,
    progress: 1,
  });
  controls.onPlay();
  assert.equal(frames.size, 0);
});

Deno.test("Replay Viewer selection change cancels old playback and stale callbacks", () => {
  const { view, controls, calls, frames } = setup();
  view.setReplay(record());
  controls.onPlay();
  const stale = [...frames.values()][0];
  view.setReplay(null);
  stale(1000);
  assert.equal(calls.at(-1)[0], null);
  assert.equal(frames.size, 0);
  view.setReplay({ ...record(), chartId: "chirp-scratch" });
  assert.equal(calls.at(-1)[0].currentTime, 0);
});

Deno.test("Replay Viewer invalid record reports error and disables Panel", () => {
  const { view, calls } = setup();
  const warn = console.warn;
  let warnings = 0;
  console.warn = () => warnings++;
  try {
    view.setReplay({});
    assert.equal(calls.at(-1)[0], null);
    assert.match(calls.at(-1)[1], /Replay/);
    assert.equal(warnings, 1);
  } finally {
    console.warn = warn;
  }
});
