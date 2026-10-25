import assert from "node:assert/strict";
import {
  createPlaybackController,
} from "../../src/application/playback-controller.js";

function setup({
  challengeOverrides = {},
  repeat = true,
  now = () => 100,
} = {}) {
  const calls = [];
  const state = {
    bpm: 60,
    clickEnabled: true,
    clickIntervalSteps: 1,
    currentStep: 0,
    isBuilderPlayback: false,
    isPlaying: false,
    repeat,
  };
  const timer = createFakeTimer(calls);
  const challengeHooks = typeof challengeOverrides === "function"
    ? challengeOverrides(calls)
    : challengeOverrides;
  const chart = {
    steps: ["F", "B"],
    scoreData: null,
    scoreGrid: { beatsPerBar: 2, ticksPerBar: 2 },
  };
  const controller = createPlaybackController({
    timer,
    state,
    actions: {
      setPlaybackState: (values) => {
        calls.push(`state:${Object.keys(values).join(",")}`);
        Object.assign(state, values);
      },
    },
    getPlaybackChart: () => chart,
    playbackRules: {
      getClickActions: () => {
        calls.push("rules:click");
        return { shouldPlay: true, isDownbeat: true };
      },
      getPlaybackEvent: () => {
        calls.push("rules:event");
        return { activeEvent: null, eventIndex: -1 };
      },
      shouldSilenceScratch: () => {
        calls.push("rules:silence");
        return false;
      },
      getScratchActions: () => {
        calls.push("rules:scratch");
        return {
          soundType: "F",
          startTick: 0,
          strokeRunLength: 1,
          options: {},
        };
      },
      updatePlaybackCursor: (step, _length, shouldRepeat) => {
        calls.push(`rules:cursor:${step}:${shouldRepeat}`);
        return { currentStep: step === 0 ? 1 : 0, shouldStop: false };
      },
    },
    audio: {
      initializeAudio: () => calls.push("audio:initialize"),
      playClickSound: () => calls.push("audio:click"),
      playScratch: () => calls.push("audio:scratch"),
      silenceActiveScratch: () => calls.push("audio:silence"),
    },
    view: {
      setPlaybackButton: (playing) => calls.push(`view:button:${playing}`),
      renderPlaybackProgress: () => calls.push("view:progress"),
      renderSelectedChart: () => calls.push("view:selected"),
      renderBuilderScore: () => calls.push("view:builder"),
    },
    challenge: {
      isLooping: () => false,
      hasSeenTick: () => false,
      markTickSeen: () => calls.push("challenge:seen"),
      onLoopBoundary: () => calls.push("challenge:boundary"),
      createLoopState: (timestamp, loopNumber) => {
        calls.push(`challenge:loop-state:${timestamp}:${loopNumber}`);
        return { startTime: timestamp };
      },
      ...challengeHooks,
    },
    now,
  });
  return { calls, controller, state, timer };
}

function createFakeTimer(calls) {
  let running = false;
  let callback = null;
  return {
    get isRunning() {
      return running;
    },
    start(intervalMs, onTick) {
      running = true;
      callback = onTick;
      calls.push(`timer:start:${intervalMs}`);
      onTick();
    },
    stop() {
      running = false;
      callback = null;
      calls.push("timer:stop");
    },
    fire() {
      if (running) callback();
    },
  };
}

Deno.test("playback preserves immediate tick callback ordering", () => {
  const { calls, controller, state } = setup();

  controller.start();

  assert.deepEqual(calls, [
    "audio:initialize",
    "challenge:loop-state:100:1",
    "state:isBuilderPlayback",
    "state:isPlaying",
    "view:button:true",
    "timer:start:1000",
    "rules:click",
    "rules:event",
    "rules:silence",
    "audio:click",
    "rules:scratch",
    "audio:scratch",
    "view:progress",
    "rules:cursor:0:true",
    "state:currentStep",
  ]);
  assert.equal(state.currentStep, 1);
  assert.equal(controller.getPlaybackSnapshot().currentStep, 1);
  const event = { type: "scratch", time: 110 };
  assert.equal(controller.recordLoopEvent(event), true);
  assert.deepEqual(controller.getPlaybackSnapshot().events, [event]);
});

Deno.test(
  "challenge boundary callbacks run before playback and may stop the tick",
  () => {
    let timestamp = 100;
    let looping = false;
    const seenTick = true;
    const controllerRef = {};
    const setupResult = setup({
      now: () => timestamp,
      challengeOverrides: (calls) => ({
        isLooping: () => looping,
        hasSeenTick: () => seenTick,
        markTickSeen: () => calls.push("challenge:seen"),
        onLoopBoundary: () => {
          calls.push("challenge:boundary");
          controllerRef.current.stop();
        },
      }),
    });
    const { calls, state, timer } = setupResult;
    controllerRef.current = setupResult.controller;
    const controller = controllerRef.current;

    controller.start();
    calls.length = 0;
    state.currentStep = 0;
    looping = true;
    timestamp = 200;
    timer.fire();

    assert.deepEqual(calls, [
      "challenge:loop-state:200:2",
      "challenge:boundary",
      "timer:stop",
      "audio:silence",
      "state:isPlaying,currentStep",
      "view:button:false",
      "view:selected",
      "state:isBuilderPlayback",
    ]);
    assert.equal(state.isPlaying, false);
    assert.deepEqual(controller.getPlaybackSnapshot(), {
      events: [],
      startedAt: 200,
      currentStep: 1,
      loopNumber: 2,
      loopState: { startTime: 200 },
      stoppedAt: 200,
    });
  },
);

Deno.test(
  "stop and restart replace the timer and preserve playback state transitions",
  () => {
    let timestamp = 100;
    const { calls, controller, state, timer } = setup({
      now: () => timestamp,
    });

    controller.start();
    assert.equal(state.currentStep, 1);
    timestamp = 200;
    controller.start(true);
    assert.equal(state.isBuilderPlayback, true);
    assert.equal(state.currentStep, 0);
    assert.equal(controller.isRunning, true);

    controller.stop();
    assert.equal(controller.isRunning, false);
    assert.equal(state.currentStep, 0);
    assert.equal(controller.getPlaybackSnapshot().stoppedAt, 200);
    const callsAtStop = [...calls];
    timer.fire();
    assert.deepEqual(calls, callsAtStop);

    timestamp = 300;
    controller.start();
    assert.equal(controller.isRunning, true);
    assert.equal(state.currentStep, 1);
    assert.equal(controller.getPlaybackSnapshot().startedAt, 300);
    assert.equal(controller.getPlaybackSnapshot().loopNumber, 1);
  },
);
