/**
 * State machine for one automated BPM Challenge attempt.
 *
 * idle → warmup (lap 1) → recording (laps 2–3) → analyzing → completed
 *
 * The machine is pure: the app feeds it playback loop boundaries and applies
 * the side effects (recording, stopping playback, analysis) that each
 * transition asks for.
 */

export const CHALLENGE_PHASES = Object.freeze({
  IDLE: "idle",
  WARMUP: "warmup",
  RECORDING: "recording",
  ANALYZING: "analyzing",
  COMPLETED: "completed",
});

/** Total challenge laps, including the playback-only warmup. */
export const CHALLENGE_LAPS = 3;

/** Number of recorded loops. The warmup lap is never scored. */
export const RECORDING_LOOPS = CHALLENGE_LAPS - 1;

export const CHALLENGE_EVENTS = Object.freeze({
  START: "start",
  LOOP_END: "loop-end",
  ANALYZED: "analyzed",
  ABORT: "abort",
});

export const PROGRESS_STEPS = Object.freeze([
  { id: "warmup", label: "Warm-up (Lap 1)" },
  { id: "recording-2", label: "Recording Lap 2/3" },
  { id: "recording-3", label: "Recording Lap 3/3" },
  { id: "analyzing", label: "Analyzing" },
  { id: "completed", label: "Result" },
]);

/** @returns {{phase: string, lap: number, take: number}} An idle session. */
export function createChallengeSession() {
  return { phase: CHALLENGE_PHASES.IDLE, lap: 0, take: 0 };
}

/** @returns {boolean} True while playback or analysis is in progress. */
export function isSessionRunning(session) {
  return [
    CHALLENGE_PHASES.WARMUP,
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
 * @param {{phase: string, lap: number, take: number}} session Current session.
 * @param {string} event One of {@link CHALLENGE_EVENTS}.
 * @returns {{session: object, effect: string|null}} The next session and the
 *   side effect the caller must perform: "start-playback", "start-recording",
 *   "next-recording", "finish-recording", or null.
 */
export function transitionSession(session, event) {
  const { phase, lap, take } = session;
  const next = (nextPhase, nextLap, nextTake, effect) => ({
    session: { phase: nextPhase, lap: nextLap, take: nextTake },
    effect,
  });

  if (event === CHALLENGE_EVENTS.ABORT) {
    return next(CHALLENGE_PHASES.IDLE, 0, 0, null);
  }
  if (
    event === CHALLENGE_EVENTS.START &&
    (phase === CHALLENGE_PHASES.IDLE ||
      phase === CHALLENGE_PHASES.COMPLETED)
  ) {
    return next(CHALLENGE_PHASES.WARMUP, 1, 0, "start-playback");
  }
  if (event === CHALLENGE_EVENTS.LOOP_END) {
    if (phase === CHALLENGE_PHASES.WARMUP) {
      return next(CHALLENGE_PHASES.RECORDING, 2, 1, "start-recording");
    }
    if (phase === CHALLENGE_PHASES.RECORDING && lap < CHALLENGE_LAPS) {
      return next(
        CHALLENGE_PHASES.RECORDING,
        lap + 1,
        take + 1,
        "next-recording",
      );
    }
    if (phase === CHALLENGE_PHASES.RECORDING) {
      return next(CHALLENGE_PHASES.ANALYZING, lap, take, "finish-recording");
    }
  }
  if (
    event === CHALLENGE_EVENTS.ANALYZED &&
    phase === CHALLENGE_PHASES.ANALYZING
  ) {
    return next(CHALLENGE_PHASES.COMPLETED, lap, take, null);
  }
  return { session, effect: null };
}

/**
 * Describes the progress indicator for a session.
 * @returns {{id: string, label: string, state: "done"|"current"|"pending"}[]}
 */
export function describeSessionProgress(session) {
  const currentId = {
    [CHALLENGE_PHASES.WARMUP]: "warmup",
    [CHALLENGE_PHASES.RECORDING]: `recording-${session.lap}`,
    [CHALLENGE_PHASES.ANALYZING]: "analyzing",
    [CHALLENGE_PHASES.COMPLETED]: "completed",
  }[session.phase] ?? null;
  const currentIndex = PROGRESS_STEPS.findIndex((step) =>
    step.id === currentId
  );
  return PROGRESS_STEPS.map((step, index) => ({
    ...step,
    state: currentIndex < 0 || index > currentIndex
      ? "pending"
      : index === currentIndex
      ? (session.phase === CHALLENGE_PHASES.COMPLETED ? "done" : "current")
      : "done",
  }));
}

/**
 * Message shown while a phase is running. The result message is produced
 * after analysis, so completed (and idle) return null.
 * @returns {string|null}
 */
export function describeSessionStatus(session, bpm) {
  switch (session.phase) {
    case CHALLENGE_PHASES.WARMUP:
      return `${bpm} BPM: ウォームアップ（Lap 1、採点されません）。譜面を見て動きを確認してください。`;
    case CHALLENGE_PHASES.RECORDING:
      return `${bpm} BPM: 記録 Lap ${session.lap}/${CHALLENGE_LAPS} — ` +
        "譜面に合わせて演奏してください。";
    case CHALLENGE_PHASES.ANALYZING:
      return "記録を判定しています…";
    default:
      return null;
  }
}
