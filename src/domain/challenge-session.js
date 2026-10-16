/**
 * State machine for one automated BPM Challenge attempt.
 *
 * ready → demo → recording 1/2 → recording 2/2 → analyzing → result
 *
 * The machine is pure: the app feeds it playback loop boundaries and applies
 * the side effects (recording, stopping playback, analysis) that each
 * transition asks for.
 */

export const CHALLENGE_PHASES = Object.freeze({
  READY: "ready",
  DEMO: "demo",
  RECORDING: "recording",
  ANALYZING: "analyzing",
  RESULT: "result",
});

/** Number of recorded loops. The demo loop before them is never scored. */
export const RECORDING_LOOPS = 2;

export const CHALLENGE_EVENTS = Object.freeze({
  START: "start",
  LOOP_END: "loop-end",
  ANALYZED: "analyzed",
  ABORT: "abort",
});

export const PROGRESS_STEPS = Object.freeze([
  { id: "demo", label: "Demo" },
  { id: "recording-1", label: `Recording 1/${RECORDING_LOOPS}` },
  { id: "recording-2", label: `Recording 2/${RECORDING_LOOPS}` },
  { id: "analyzing", label: "Analyzing" },
  { id: "result", label: "Result" },
]);

/** @returns {{phase: string, take: number}} A session that has not started. */
export function createChallengeSession() {
  return { phase: CHALLENGE_PHASES.READY, take: 0 };
}

/** @returns {boolean} True while playback or analysis is in progress. */
export function isSessionRunning(session) {
  return [
    CHALLENGE_PHASES.DEMO,
    CHALLENGE_PHASES.RECORDING,
    CHALLENGE_PHASES.ANALYZING,
  ].includes(session.phase);
}

/** @returns {boolean} True while MIDI input is being recorded. */
export function isSessionRecording(session) {
  return session.phase === CHALLENGE_PHASES.RECORDING;
}

/**
 * Applies one event. Events that do not apply to the current phase are
 * ignored, so a late timer can never move a finished session.
 * @param {{phase: string, take: number}} session Current session.
 * @param {string} event One of {@link CHALLENGE_EVENTS}.
 * @returns {{session: object, effect: string|null}} The next session and the
 *   side effect the caller must perform: "start-playback", "start-recording",
 *   "next-recording", "finish-recording", or null.
 */
export function transitionSession(session, event) {
  const { phase, take } = session;
  const next = (nextPhase, nextTake, effect) => ({
    session: { phase: nextPhase, take: nextTake },
    effect,
  });

  if (event === CHALLENGE_EVENTS.ABORT) {
    return next(CHALLENGE_PHASES.READY, 0, null);
  }
  if (
    event === CHALLENGE_EVENTS.START &&
    (phase === CHALLENGE_PHASES.READY || phase === CHALLENGE_PHASES.RESULT)
  ) {
    return next(CHALLENGE_PHASES.DEMO, 0, "start-playback");
  }
  if (event === CHALLENGE_EVENTS.LOOP_END) {
    if (phase === CHALLENGE_PHASES.DEMO) {
      return next(CHALLENGE_PHASES.RECORDING, 1, "start-recording");
    }
    if (phase === CHALLENGE_PHASES.RECORDING && take < RECORDING_LOOPS) {
      return next(CHALLENGE_PHASES.RECORDING, take + 1, "next-recording");
    }
    if (phase === CHALLENGE_PHASES.RECORDING) {
      return next(CHALLENGE_PHASES.ANALYZING, take, "finish-recording");
    }
  }
  if (
    event === CHALLENGE_EVENTS.ANALYZED && phase === CHALLENGE_PHASES.ANALYZING
  ) {
    return next(CHALLENGE_PHASES.RESULT, 0, null);
  }
  return { session, effect: null };
}

/**
 * Describes the progress indicator for a session.
 * @returns {{id: string, label: string, state: "done"|"current"|"pending"}[]}
 */
export function describeSessionProgress(session) {
  const currentId = {
    [CHALLENGE_PHASES.DEMO]: "demo",
    [CHALLENGE_PHASES.RECORDING]: `recording-${session.take}`,
    [CHALLENGE_PHASES.ANALYZING]: "analyzing",
    [CHALLENGE_PHASES.RESULT]: "result",
  }[session.phase] ?? null;
  const currentIndex = PROGRESS_STEPS.findIndex((step) =>
    step.id === currentId
  );
  return PROGRESS_STEPS.map((step, index) => ({
    ...step,
    state: currentIndex < 0 || index > currentIndex
      ? "pending"
      : index === currentIndex
      ? (session.phase === CHALLENGE_PHASES.RESULT ? "done" : "current")
      : "done",
  }));
}

/**
 * Message shown while a phase is running. The result message is produced
 * after analysis, so result (and ready) return null.
 * @returns {string|null}
 */
export function describeSessionStatus(session, bpm) {
  switch (session.phase) {
    case CHALLENGE_PHASES.DEMO:
      return `${bpm} BPM: お手本ループです（採点されません）。譜面を見て動きを確認してください。`;
    case CHALLENGE_PHASES.RECORDING:
      return `${bpm} BPM: 記録 ${session.take}/${RECORDING_LOOPS} — 譜面に合わせて演奏してください。`;
    case CHALLENGE_PHASES.ANALYZING:
      return "記録を判定しています…";
    default:
      return null;
  }
}
