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
