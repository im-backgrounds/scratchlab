import assert from "node:assert/strict";
import { CHALLENGE_PHASES } from "../../src/domain/challenge-session.js";
import {
  CHALLENGE_ANALYSIS_DELAY_MS,
  createChallengeController,
} from "../../src/application/challenge-controller.js";

function setup() {
  const calls = [];
  const timers = [];
  const controller = createChallengeController({
    playback: {
      stop: () => calls.push("playback:stop"),
      start: (builder) => calls.push(`playback:start:${builder}`),
      setLoopState: (loopState) =>
        calls.push(`playback:loop:${loopState.loopIndex}`),
    },
    recording: {
      start: (run, timestamp, take) => {
        calls.push(`recording:start:${take}:${timestamp}`);
        run.startedAt = timestamp;
        run.loopEnds = [];
        return { loopIndex: take };
      },
      closeLoop: (_run, timestamp) =>
        calls.push(`recording:close:${timestamp}`),
      startNextLoop: (_run, timestamp, take) => {
        calls.push(`recording:next:${take}:${timestamp}`);
        return { loopIndex: take };
      },
      finish: (_run, timestamp) => {
        calls.push(`recording:finish:${timestamp}`);
        return { durationMs: 200 };
      },
      abort: () => calls.push("recording:abort"),
    },
    analysis: {
      complete: (performance, run, { chartKey, repositories }) =>
        calls.push(
          `analysis:${performance.durationMs}:${run.bpm}:${chartKey}:${repositories.challenge}:${
            run.courseStageId ?? "bpm-challenge"
          }`,
        ),
    },
    repositories: { challenge: "challenge-repository" },
    transport: {
      setBpm: (bpm) => calls.push(`transport:bpm:${bpm}`),
      updateValues: () => calls.push("transport:update"),
    },
    ui: {
      setChallengeStatus: (message) => calls.push(`status:${message}`),
      renderChallengePanel: () => calls.push("render:challenge"),
      renderBeginnerCourse: () => calls.push("render:course"),
      onRecordingStart: () => calls.push("ui:recording-start"),
    },
    createSessionId: () => "session-1",
    setTimer: (callback, delay) => timers.push({ callback, delay }),
    now: () => 0,
  });
  return { calls, controller, timers };
}

Deno.test(
  "challenge starts in warm-up and records only the second and third laps",
  () => {
    const { calls, controller, timers } = setup();

    assert.equal(
      controller.start({ chartKey: "builtin:chart", bpm: 80 }),
      true,
    );
    assert.equal(controller.getSession().phase, CHALLENGE_PHASES.WARMUP);
    assert.equal(controller.isLooping(), true);
    assert.equal(
      controller.start({ chartKey: "builtin:another-chart", bpm: 85 }),
      false,
    );

    controller.markTickSeen();
    assert.equal(controller.hasSeenTick(), true);
    controller.onLoopBoundary(100);
    assert.equal(controller.getSession().phase, CHALLENGE_PHASES.RECORDING);
    assert.equal(controller.getSession().lap, 2);

    controller.onLoopBoundary(200);
    assert.equal(controller.getSession().lap, 3);
    controller.onLoopBoundary(300);

    assert.equal(controller.getSession().phase, CHALLENGE_PHASES.ANALYZING);
    assert.equal(controller.isLooping(), false);
    assert.equal(timers.length, 1);
    assert.equal(timers[0].delay, CHALLENGE_ANALYSIS_DELAY_MS);
    assert.deepEqual(
      calls.filter((call) => call.startsWith("recording:")),
      [
        "recording:start:1:100",
        "recording:close:200",
        "recording:next:2:200",
        "recording:finish:300",
      ],
    );
    assert.ok(
      calls.indexOf("playback:loop:1") <
        calls.indexOf("ui:recording-start"),
    );

    timers[0].callback();
    assert.equal(controller.getSession().phase, CHALLENGE_PHASES.COMPLETED);
    assert.equal(controller.getActiveChallengeKey(), null);
    assert.ok(
      calls.includes(
        "analysis:200:80:builtin:chart:challenge-repository:bpm-challenge",
      ),
    );
  },
);

Deno.test("Beginner Course uses the same lifecycle with its stage context", () => {
  const { calls, controller, timers } = setup();

  controller.start({
    chartKey: "builtin:baby-scratch",
    bpm: 90,
    courseStageId: "baby-scratch-bpm90",
    afterStart: () => calls.push("course:started"),
  });
  controller.onLoopBoundary(100);
  controller.onLoopBoundary(200);
  controller.onLoopBoundary(300);
  timers[0].callback();

  assert.ok(calls.includes("course:started"));
  assert.ok(
    calls.includes(
      "analysis:200:90:builtin:baby-scratch:challenge-repository:baby-scratch-bpm90",
    ),
  );
  assert.equal(controller.getSession().phase, CHALLENGE_PHASES.COMPLETED);
});

Deno.test("abort cancels an analyzing result and ignores its delayed callback", () => {
  const { calls, controller, timers } = setup();

  controller.start({ chartKey: "builtin:chart", bpm: 80 });
  controller.onLoopBoundary(100);
  controller.onLoopBoundary(200);
  controller.onLoopBoundary(300);
  controller.abort("aborted");

  assert.equal(controller.getSession().phase, CHALLENGE_PHASES.IDLE);
  assert.equal(controller.isRunning(), false);
  assert.equal(controller.getActiveChallengeKey(), null);
  assert.ok(calls.includes("status:aborted"));
  timers[0].callback();
  assert.equal(
    calls.some((call) => call.startsWith("analysis:")),
    false,
  );
});

Deno.test("abort during warm-up stops the active run without recording", () => {
  const { calls, controller } = setup();

  controller.start({ chartKey: "builtin:chart", bpm: 80 });
  controller.abort("chart switched");

  assert.equal(controller.getSession().phase, CHALLENGE_PHASES.IDLE);
  assert.equal(controller.getActiveChallengeKey(), null);
  assert.equal(controller.isLooping(), false);
  assert.equal(
    calls.some((call) => call.startsWith("recording:start:")),
    false,
  );
  assert.ok(calls.includes("status:chart switched"));
});

Deno.test("cancel stops playback, aborts recording, and returns to idle", () => {
  const { calls, controller } = setup();

  controller.start({ chartKey: "builtin:chart", bpm: 80 });
  controller.onLoopBoundary(100);
  controller.cancel("playback stopped");

  assert.equal(controller.getSession().phase, CHALLENGE_PHASES.IDLE);
  assert.deepEqual(
    calls.filter((call) =>
      call === "playback:stop" || call === "recording:abort"
    ),
    ["playback:stop", "playback:stop", "recording:abort"],
  );
  assert.ok(calls.includes("status:playback stopped"));
});
