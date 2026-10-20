import assert from "node:assert/strict";
import { compileScoreData } from "../../src/domain/score-compiler.js";
import {
  buildScratchTrigger,
  createLoopBoundary,
  createLoopState,
  getClickActions,
  getPlaybackEvent,
  handlePlaybackBoundary,
  isEventInLoop,
  shouldSilenceScratch,
  updatePlaybackCursor,
} from "../../src/domain/playback.js";

function compile(score) {
  return compileScoreData({ name: "Playback test", beat: "4/4", score });
}

Deno.test("adjacent same-direction strokes merge into one scratch trigger", () => {
  const scoreData = compile([["F", "F"]]);
  const trigger = buildScratchTrigger(scoreData, 0, 120);

  assert.equal(trigger.startTick, 0);
  assert.equal(trigger.soundType, "L");
  assert.equal(trigger.options.durationSeconds, 2);
  assert.equal(trigger.options.suppressFriction, true);
  assert.equal(buildScratchTrigger(scoreData, 1, 120), null);
});

function boundary(edge, time, overrides = {}) {
  return createLoopBoundary({
    edge,
    time,
    sessionId: "test-session",
    loopIndex: 1,
    phase: "recording",
    inputState: { currentDirection: "forward", faderState: "closed" },
    ...overrides,
  });
}

Deno.test("v2 loop boundaries capture physical state as control events", () => {
  const inputState = { currentDirection: "forward", faderState: "closed" };
  const start = boundary("start", 1000, { inputState });
  inputState.currentDirection = "backward";
  inputState.faderState = "open";
  const end = boundary("end", 2000, { inputState });
  assert.equal(start.type, "loop-boundary");
  assert.equal(start.currentDirection, "forward");
  assert.equal(start.faderState, "closed");
  assert.equal(end.currentDirection, "backward");
  assert.ok(Object.isFrozen(start));
  assert.deepEqual(createLoopState(start, end), {
    sessionId: "test-session",
    loopIndex: 1,
    phase: "recording",
    startTime: 1000,
    endTime: 2000,
    startDirection: "forward",
    startFaderState: "closed",
  });
});

Deno.test("v2 loop ownership is half-open with no overlap or boundary gap", () => {
  const first = createLoopState(boundary("start", 1000), boundary("end", 2000));
  const second = createLoopState(
    boundary("start", 2000, { loopIndex: 2 }),
    boundary("end", 3000, { loopIndex: 2 }),
  );
  for (
    const [time, ownership] of [
      [999, [false, false]],
      [1000, [true, false]],
      [1999.999, [true, false]],
      [2000, [false, true]],
      [2000.001, [false, true]],
      [2999.999, [false, true]],
      [3000, [false, false]],
    ]
  ) {
    assert.deepEqual(
      [first, second].map((loop) => isEventInLoop({ time }, loop)),
      ownership,
    );
  }
});

Deno.test("v2 loop boundaries reject invalid state or inconsistent intervals", () => {
  for (
    const overrides of [
      { time: NaN },
      { loopIndex: -1 },
      { loopIndex: 1.5 },
      { sessionId: "" },
      { phase: "result" },
      { edge: "stop" },
      { inputState: { currentDirection: "stop", faderState: "closed" } },
      { inputState: { currentDirection: "forward", faderState: "invalid" } },
    ]
  ) {
    assert.throws(() => boundary("start", 1000, overrides), TypeError);
  }
  const start = boundary("start", 1000);
  for (
    const end of [
      boundary("end", 999),
      boundary("end", 1000),
      boundary("start", 2000),
      boundary("end", 2000, { loopIndex: 2 }),
      boundary("end", 2000, { sessionId: "another-session" }),
      boundary("end", 2000, { phase: "demo" }),
    ]
  ) {
    assert.throws(() => createLoopState(start, end), TypeError);
  }
});

Deno.test("flare tails continue without a second trigger", () => {
  const scoreData = compile([["FF", "F"]]);
  const flare = buildScratchTrigger(scoreData, 0, 120);

  assert.equal(flare.soundType, "F");
  assert.equal(flare.options.durationSeconds, 2);
  assert.equal(buildScratchTrigger(scoreData, 1, 120), null);
});

Deno.test("keep events silence scratch and do not trigger a sound", () => {
  const scoreData = compile([["F", "K", "F"]]);
  const keepEvent = scoreData.events[1];

  assert.equal(shouldSilenceScratch(keepEvent), true);
  assert.equal(shouldSilenceScratch(scoreData.events[0]), false);
  assert.equal(buildScratchTrigger(scoreData, 1, 120), null);
});

Deno.test("scratch trigger duration scales inversely with BPM", () => {
  const scoreData = compile(["F"]);

  assert.equal(
    buildScratchTrigger(scoreData, 0, 120).options.durationSeconds,
    2,
  );
  assert.equal(
    buildScratchTrigger(scoreData, 0, 60).options.durationSeconds,
    4,
  );
});

Deno.test("click-track timing follows the score grid", () => {
  const scoreGrid = { ticksPerBar: 8, beatsPerBar: 4 };

  assert.deepEqual(getClickActions(scoreGrid, 2, 2, true), {
    shouldPlay: true,
    isDownbeat: false,
  });
  assert.deepEqual(getClickActions(scoreGrid, 8, 2, true), {
    shouldPlay: true,
    isDownbeat: true,
  });
  assert.deepEqual(getClickActions(scoreGrid, 2, 2, false), {
    shouldPlay: false,
    isDownbeat: false,
  });
});

Deno.test("getPlaybackEvent finds the active event and its boundary index", () => {
  const scoreData = compile([["F", "B"]]);

  assert.deepEqual(getPlaybackEvent(scoreData, 0), {
    activeEvent: scoreData.events[0],
    eventIndex: 0,
  });
  assert.deepEqual(getPlaybackEvent(scoreData, 4), {
    activeEvent: scoreData.events[1],
    eventIndex: 1,
  });
  assert.deepEqual(getPlaybackEvent(null, 0), {
    activeEvent: null,
    eventIndex: -1,
  });
});

Deno.test("playback boundary loops or stops at the final step", () => {
  assert.equal(handlePlaybackBoundary(2, 4, true), null);
  assert.equal(handlePlaybackBoundary(3, 4, true), "loop");
  assert.equal(handlePlaybackBoundary(3, 4, false), "stop");
  assert.deepEqual(updatePlaybackCursor(2, 4, true), {
    currentStep: 3,
    shouldStop: false,
  });
});

Deno.test("playback cursor resets for loop and stop boundaries", () => {
  assert.deepEqual(updatePlaybackCursor(3, 4, true), {
    currentStep: 0,
    shouldStop: false,
  });
  assert.deepEqual(updatePlaybackCursor(3, 4, false), {
    currentStep: 0,
    shouldStop: true,
  });
});
