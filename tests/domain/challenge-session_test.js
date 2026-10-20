import assert from "node:assert/strict";
import {
  CHALLENGE_EVENTS,
  CHALLENGE_PHASES,
  createChallengeSession,
  describeSessionProgress,
  describeSessionStatus,
  isSessionRunning,
  transitionSession,
} from "../../src/domain/challenge-session.js";
import { createStopDetector } from "../../src/domain/midi-mapping.js";
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

Deno.test("a full attempt runs demo, two recordings, analysis, result", () => {
  const { session, effects } = run([
    START,
    LOOP_END,
    LOOP_END,
    LOOP_END,
    ANALYZED,
  ]);
  assert.equal(session.phase, CHALLENGE_PHASES.RESULT);
  assert.deepEqual(effects, [
    "start-playback",
    "start-recording",
    "next-recording",
    "finish-recording",
    null,
  ]);
});

Deno.test("the demo loop is not recorded", () => {
  const { session } = run([START]);
  assert.equal(session.phase, CHALLENGE_PHASES.DEMO);
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
  assert.equal(first.take, 1);
  assert.deepEqual(states(first), [
    "done",
    "current",
    "pending",
    "pending",
    "pending",
  ]);
  const second = run([LOOP_END], first).session;
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
    "Demo",
    "Recording 1/2",
    "Recording 2/2",
    "Analyzing",
    "Result",
  ]);
});

Deno.test("abort returns to ready from any phase", () => {
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
  const ready = createChallengeSession();
  assert.deepEqual(run([LOOP_END, ANALYZED], ready).effects, [null, null]);
  const demo = run([START]).session;
  assert.deepEqual(run([START, ANALYZED], demo), {
    session: demo,
    effects: [null, null],
  });
  // A late analysis result cannot revive an aborted attempt.
  assert.equal(
    run([ABORT, ANALYZED], demo).session.phase,
    CHALLENGE_PHASES.READY,
  );
});

Deno.test("a result can be started again", () => {
  const done = run([START, LOOP_END, LOOP_END, LOOP_END, ANALYZED]).session;
  const again = transitionSession(done, START);
  assert.equal(again.session.phase, CHALLENGE_PHASES.DEMO);
  assert.equal(again.effect, "start-playback");
});

Deno.test("status messages exist only while a phase is running", () => {
  assert.match(
    describeSessionStatus(run([START]).session, 80),
    /採点されません/,
  );
  assert.match(
    describeSessionStatus(run([START, LOOP_END, LOOP_END]).session, 80),
    /記録 2\/2/,
  );
  assert.equal(describeSessionStatus(createChallengeSession(), 80), null);
});

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
  assert.deepEqual(session, { phase: CHALLENGE_PHASES.RECORDING, take: 1 });
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

      // The state machine emits no input; app.js separately flushes MIDI stops.
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
