import assert from "node:assert/strict";
import {
  CHALLENGE_EVENTS,
  CHALLENGE_PHASES,
  createChallengeSession,
  describeSessionProgress,
  describeSessionStatus,
  isSessionRecording,
  isSessionRunning,
  transitionSession,
} from "../../src/domain/challenge-session.js";
import {
  createEventCompressor,
  createStopDetector,
  createStopObserver,
} from "../../src/domain/midi-mapping.js";
import {
  createLoopBoundary,
  createLoopState,
  isEventInLoop,
} from "../../src/domain/playback.js";
import {
  analyzePerformanceLoops,
  createExpectedEvents,
} from "../../src/domain/performance-analysis.js";
import { createPerformance } from "../../src/domain/performance.js";
import { compileScoreData } from "../../src/domain/score-compiler.js";

const { START, LOOP_END, ANALYZED, ABORT } = CHALLENGE_EVENTS;

function run(events, session = createChallengeSession()) {
  const effects = [];
  for (const event of events) {
    const next = transitionSession(session, event);
    session = next.session;
    effects.push(next.effect);
  }
  return { session, effects };
}

const states = (session) =>
  describeSessionProgress(session).map((step) => step.state);

Deno.test(
  "a full attempt warms up, records two laps, analyzes, and completes",
  () => {
    const { session, effects } = run([
      START,
      LOOP_END,
      LOOP_END,
      LOOP_END,
      ANALYZED,
    ]);
    assert.equal(session.phase, CHALLENGE_PHASES.COMPLETED);
    assert.deepEqual(effects, [
      "start-playback",
      "start-recording",
      "next-recording",
      "finish-recording",
      null,
    ]);
  },
);

Deno.test("lap 1 is a playback-only warmup", () => {
  const { session } = run([START]);
  assert.equal(session.phase, CHALLENGE_PHASES.WARMUP);
  assert.equal(session.lap, 1);
  assert.deepEqual(states(session), [
    "current",
    "pending",
    "pending",
    "pending",
    "pending",
  ]);
});

Deno.test("recording progress follows the loop boundaries", () => {
  const first = run([START, LOOP_END]).session;
  assert.equal(first.phase, CHALLENGE_PHASES.RECORDING);
  assert.equal(first.lap, 2);
  assert.equal(first.take, 1);
  assert.deepEqual(states(first), [
    "done",
    "current",
    "pending",
    "pending",
    "pending",
  ]);
  const second = run([LOOP_END], first).session;
  assert.equal(second.phase, CHALLENGE_PHASES.RECORDING);
  assert.equal(second.lap, 3);
  assert.equal(second.take, 2);
  assert.deepEqual(states(second), [
    "done",
    "done",
    "current",
    "pending",
    "pending",
  ]);
  const analyzing = run([LOOP_END], second).session;
  assert.equal(analyzing.phase, CHALLENGE_PHASES.ANALYZING);
  assert.equal(isSessionRunning(analyzing), true);
});

Deno.test("a finished attempt shows every step as done", () => {
  const { session } = run([START, LOOP_END, LOOP_END, LOOP_END, ANALYZED]);
  assert.deepEqual(states(session), Array(5).fill("done"));
  assert.equal(isSessionRunning(session), false);
});

Deno.test("progress labels match the specification", () => {
  const labels = describeSessionProgress(createChallengeSession()).map((s) =>
    s.label
  );
  assert.deepEqual(labels, [
    "Warm-up (Lap 1)",
    "Recording Lap 2/3",
    "Recording Lap 3/3",
    "Analyzing",
    "Result",
  ]);
});

Deno.test("abort returns to idle from any phase", () => {
  for (
    const events of [[START], [START, LOOP_END], [
      START,
      LOOP_END,
      LOOP_END,
      LOOP_END,
    ]]
  ) {
    const aborted = run([ABORT], run(events).session).session;
    assert.deepEqual(aborted, createChallengeSession());
  }
});

Deno.test("events that do not apply are ignored", () => {
  const idle = createChallengeSession();
  assert.deepEqual(run([LOOP_END, ANALYZED], idle).effects, [null, null]);
  const warmup = run([START]).session;
  assert.deepEqual(run([START, ANALYZED], warmup), {
    session: warmup,
    effects: [null, null],
  });
  // A late analysis result cannot revive an aborted attempt.
  assert.equal(
    run([ABORT, ANALYZED], warmup).session.phase,
    CHALLENGE_PHASES.IDLE,
  );
});

Deno.test("a result can be started again", () => {
  const done = run([START, LOOP_END, LOOP_END, LOOP_END, ANALYZED]).session;
  const again = transitionSession(done, START);
  assert.equal(again.session.phase, CHALLENGE_PHASES.WARMUP);
  assert.equal(again.session.lap, 1);
  assert.equal(again.session.take, 0);
  assert.equal(again.effect, "start-playback");
});

Deno.test("status messages exist only while a phase is running", () => {
  assert.match(
    describeSessionStatus(run([START]).session, 80),
    /採点されません/,
  );
  assert.match(
    describeSessionStatus(run([START, LOOP_END, LOOP_END]).session, 80),
    /記録 Lap 3\/3/,
  );
  assert.equal(describeSessionStatus(createChallengeSession(), 80), null);
});

Deno.test(
  "only laps 2 and 3 are recorded and lap 3 ends the attempt",
  () => {
    let session = createChallengeSession();
    const recordedLaps = [];
    session = transitionSession(session, START).session;
    for (let lap = 1; lap <= 3; lap += 1) {
      assert.equal(session.lap, lap);
      if (session.phase === CHALLENGE_PHASES.RECORDING) {
        recordedLaps.push(session.lap);
      }
      const boundary = transitionSession(session, LOOP_END);
      session = boundary.session;
      if (lap === 1) assert.equal(boundary.effect, "start-recording");
      if (lap === 2) assert.equal(boundary.effect, "next-recording");
      if (lap === 3) assert.equal(boundary.effect, "finish-recording");
    }
    assert.deepEqual(recordedLaps, [2, 3]);
    assert.equal(session.phase, CHALLENGE_PHASES.ANALYZING);
    assert.equal(isSessionRecording(session), false);
    assert.equal(
      transitionSession(session, ANALYZED).session.phase,
      CHALLENGE_PHASES.COMPLETED,
    );
  },
);

Deno.test("v1 regression: an inactivity stop does not advance the recording loop", () => {
  const session = run([START, LOOP_END]).session;
  const recorded = [];
  let fireStop;
  const detector = createStopDetector({
    onStop: (event) => recorded.push(event),
    setTimer: (callback) => {
      fireStop = callback;
      return 1;
    },
    clearTimer: () => {},
  });
  detector.observe({ type: "scratch", direction: "forward", time: 100 });
  assert.deepEqual(recorded, []);
  fireStop();
  assert.deepEqual(recorded, [
    { type: "scratch", direction: "stop", time: 250 },
  ]);
  assert.deepEqual(session, {
    phase: CHALLENGE_PHASES.RECORDING,
    lap: 2,
    take: 1,
  });
  detector.flush(1000);
  assert.equal(recorded.length, 1);
});

for (const pendingStop of [false, true]) {
  Deno.test(`v1 regression: loop boundary with pending stop ${pendingStop} changes recorded stop count`, () => {
    const startedAt = 10_000;
    const recorded = [];
    let scheduled = null;
    const detector = createStopDetector({
      onStop: (event) => recorded.push(event),
      setTimer: (fn) => (scheduled = fn),
      clearTimer: () => (scheduled = null),
    });
    let session = run([START, LOOP_END]).session;
    const loopEnds = [];
    for (let loop = 1; loop <= 2; loop++) {
      const boundaryAt = startedAt + loop * 1000;
      const forward = {
        type: "scratch",
        direction: "forward",
        time: boundaryAt - 10,
      };
      recorded.push(forward);
      if (pendingStop) detector.observe(forward);
      const next = transitionSession(session, LOOP_END);
      assert.equal(
        next.effect,
        loop === 1 ? "next-recording" : "finish-recording",
      );
      assert.equal(
        recorded.filter((event) => event.direction === "stop").length,
        (loop - 1) * Number(pendingStop),
      );

      // Historical v1 reproduction: app.js used to flush MIDI stops here.
      detector.flush(boundaryAt);
      assert.equal(scheduled, null);
      if (loop === 1) loopEnds.push(boundaryAt - startedAt);
      session = next.session;
    }

    const performance = createPerformance(recorded, {
      startedAt,
      endedAt: startedAt + 2000,
      loopEnds,
    });
    assert.deepEqual(performance.loopEnds, [1000]);
    assert.equal(performance.counts.stop, pendingStop ? 2 : 0);
    assert.deepEqual(
      performance.events.filter((event) => event.direction === "stop")
        .map((event) => event.t),
      pendingStop ? [1000, 2000] : [],
    );
    const expected = createExpectedEvents(
      compileScoreData({ name: "single stroke", beat: "4/4", score: [["F"]] }),
    );
    const analysis = analyzePerformanceLoops(
      expected,
      performance.events,
      performance.loopEnds,
    );
    assert.equal(analysis.matched, pendingStop ? 4 : 2);
    assert.equal(analysis.byKind.stop.missing, pendingStop ? 0 : 2);
    assert.equal(analysis.extra, 0);
    assert.equal(analysis.accuracy, pendingStop ? 100 : 50);
  });
}

Deno.test("v2 boundaries preserve demo input, recording state and the real stop timer", () => {
  const compressor = createEventCompressor();
  const recorded = [];
  let scheduled;
  let session = run([START]).session;
  const feed = (event) => {
    const kept = compressor.accept(event);
    if (kept && session.phase === CHALLENGE_PHASES.RECORDING) {
      recorded.push(kept);
    }
  };
  const detector = createStopDetector({
    onStop: feed,
    setTimer: (callback) => {
      scheduled = callback;
      return 1;
    },
    clearTimer: () => {
      scheduled = null;
    },
  });
  feed({ type: "fader", state: "closed", time: 990 });
  const forward = { type: "scratch", direction: "forward", time: 995 };
  feed(forward);
  detector.observe(forward);
  const pending = scheduled;
  for (const time of [1000, 1050]) {
    session = transitionSession(session, LOOP_END).session;
    const start = createLoopBoundary({
      edge: "start",
      sessionId: "test-session",
      loopIndex: session.take,
      phase: "recording",
      time,
      inputState: compressor.getState(),
    });
    feed({ ...forward, time });
    feed({ type: "fader", state: "closed", time });
    assert.deepEqual(recorded, []);
    assert.equal(start.currentDirection, "forward");
    assert.equal(start.faderState, "closed");
    assert.equal(scheduled, pending);
  }
  scheduled();
  assert.deepEqual(recorded, [
    { type: "scratch", direction: "stop", time: 1145 },
  ]);
  assert.equal(compressor.getState().currentDirection, "stopped");
  feed({ ...forward, time: 1150 });
  assert.equal(recorded.length, 2);
  const end = createLoopBoundary({
    edge: "end",
    sessionId: "test-session",
    loopIndex: 2,
    phase: "recording",
    time: 1200,
    inputState: compressor.getState(),
  });
  session = transitionSession(session, LOOP_END).session;
  assert.equal(session.phase, CHALLENGE_PHASES.ANALYZING);
  assert.equal(recorded.length, 2);
  assert.equal(end.currentDirection, "forward");
  assert.equal(end.faderState, "closed");
});

Deno.test("v2 physical stops survive loop transitions without becoming boundaries or scored events", () => {
  const observations = [];
  const compressor = createEventCompressor();
  let fireStop;
  const observer = createStopObserver({
    source: "midi",
    onStop: (observation) => {
      observations.push(observation);
      compressor.observeStop(observation);
    },
    setTimer: (callback) => {
      fireStop = callback;
      return 1;
    },
    clearTimer: () => {},
  });
  let session = run([START, LOOP_END]).session;
  const boundary = (edge, loopIndex, time) =>
    createLoopBoundary({
      edge,
      loopIndex,
      time,
      sessionId: "stop-test",
      phase: "recording",
      inputState: compressor.getState(),
    });
  const firstStart = boundary("start", 1, 1000);
  const movement = { type: "scratch", direction: "forward", time: 1990 };
  compressor.accept(movement);
  observer.observe(movement);
  const firstEnd = boundary("end", 1, 2000);
  session = transitionSession(session, LOOP_END).session;
  assert.equal(session.take, 2);
  const secondStart = boundary("start", 2, 2000);
  assert.deepEqual(observations, []);
  fireStop();
  assert.equal(observations[0].time, 2140);
  assert.equal(
    isEventInLoop(observations[0], createLoopState(firstStart, firstEnd)),
    false,
  );
  const secondEnd = boundary("end", 2, 3000);
  assert.equal(
    isEventInLoop(observations[0], createLoopState(secondStart, secondEnd)),
    true,
  );
  assert.equal(secondEnd.currentDirection, "stopped");
  session = transitionSession(session, LOOP_END).session;
  assert.equal(session.phase, CHALLENGE_PHASES.ANALYZING);
  assert.equal(observations.length, 1);
  assert.equal(compressor.accept(observations[0]), null);
});
