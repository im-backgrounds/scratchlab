import {
  CHALLENGE_EVENTS,
  CHALLENGE_PHASES,
  createChallengeSession,
  describeSessionStatus,
  isSessionRunning,
  transitionSession,
} from "../domain/challenge-session.js";

export const CHALLENGE_ANALYSIS_DELAY_MS = 400;

let sessionSequence = 0;

function createChallengeSessionId() {
  const crypto = globalThis.crypto;
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
  if (typeof crypto?.getRandomValues === "function") {
    const values = crypto.getRandomValues(new Uint32Array(2));
    return `session-${Date.now().toString(36)}-${values.join("-")}`;
  }
  sessionSequence += 1;
  return `session-${Date.now().toString(36)}-${sessionSequence.toString(36)}`;
}

export function createChallengeController({
  playback,
  recording,
  analysis,
  repositories,
  transport,
  ui,
  isBuilderPlayback = () => false,
  createSessionId = createChallengeSessionId,
  setTimer = setTimeout,
  now = () => Date.now(),
  analysisDelayMs = CHALLENGE_ANALYSIS_DELAY_MS,
}) {
  let session = createChallengeSession();
  let run = null;
  let activeChallengeKey = null;

  function render() {
    ui.renderChallengePanel();
    ui.renderBeginnerCourse();
  }

  function complete(performance, completedRun) {
    if (session.phase !== CHALLENGE_PHASES.ANALYZING) return;
    activeChallengeKey = null;
    analysis.complete(performance, completedRun, {
      chartKey: completedRun.chartKey,
      repositories,
    });
    run = null;
    applyEvent(CHALLENGE_EVENTS.ANALYZED);
  }

  function applyEvent(event, timestamp = now()) {
    const transition = transitionSession(session, event);
    session = transition.session;
    const message = describeSessionStatus(session, run?.bpm);
    if (message) ui.setChallengeStatus(message);

    if (transition.effect === "start-playback") {
      playback.stop();
      playback.start(false);
    } else if (transition.effect === "start-recording") {
      const loopState = recording.start(run, timestamp, session.take);
      playback.setLoopState(loopState);
      ui.onRecordingStart(run);
    } else if (transition.effect === "next-recording") {
      recording.closeLoop(run, timestamp);
      const loopState = recording.startNextLoop(
        run,
        timestamp,
        session.take,
      );
      playback.setLoopState(loopState);
      run.loopEnds.push(timestamp - run.startedAt);
    } else if (transition.effect === "finish-recording") {
      const completedRun = run;
      const performance = recording.finish(completedRun, timestamp);
      playback.stop();
      setTimer(
        () => complete(performance, completedRun),
        analysisDelayMs,
      );
    }
    render();
  }

  function start({
    chartKey,
    bpm,
    courseStageId = null,
    beforeStart = () => {},
    afterStart = () => {},
  }) {
    if (isSessionRunning(session)) return false;
    activeChallengeKey = chartKey;
    run = {
      sessionId: createSessionId(),
      chartKey,
      courseStageId,
      bpm,
      startedAt: null,
      loopEnds: [],
      tickSeen: false,
    };
    beforeStart(run);
    transport.setBpm(bpm);
    transport.updateValues();
    afterStart(run);
    applyEvent(CHALLENGE_EVENTS.START);
    return true;
  }

  function abort(
    reason = "譜面の切り替えでチャレンジを中断しました。",
  ) {
    const wasRunning = isSessionRunning(session);
    recording.abort();
    activeChallengeKey = null;
    run = null;
    session = transitionSession(session, CHALLENGE_EVENTS.ABORT).session;
    ui.setChallengeStatus(wasRunning ? reason : "");
  }

  function cancel(reason) {
    playback.stop();
    abort(reason);
    render();
  }

  function isLooping() {
    return run !== null && !isBuilderPlayback() &&
      (session.phase === CHALLENGE_PHASES.WARMUP ||
        session.phase === CHALLENGE_PHASES.RECORDING);
  }

  return {
    start,
    abort,
    cancel,
    applyEvent,
    onLoopBoundary: (timestamp) =>
      applyEvent(CHALLENGE_EVENTS.LOOP_END, timestamp),
    isLooping,
    hasSeenTick: () => run?.tickSeen === true,
    markTickSeen: () => {
      if (run) run.tickSeen = true;
    },
    isRunning: () => isSessionRunning(session),
    getSession: () => session,
    getRun: () => run,
    getActiveChallengeKey: () => activeChallengeKey,
  };
}
