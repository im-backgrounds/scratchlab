import { getReplay, saveReplay } from "../domain/replay-storage.js";
import { EVENT_MODEL_VERSION } from "../domain/performance-analysis.js";
import { RECORDING_LOOPS } from "../domain/challenge-session.js";

/**
 * Holds the selected chart's Replay only in memory, without playback or saving.
 * @param {Storage|null} [storage] Optional LocalStorage-compatible backend.
 */
export function createReplaySelection(storage) {
  let selectedReplay = null;
  return {
    get selectedReplay() {
      return selectedReplay;
    },
    selectChart(chartId) {
      const record = getReplay(chartId, storage);
      selectedReplay = record
        ? {
          chartId: record.chartId,
          bpm: record.bpm,
          replayContext: record.replayContext,
          recordedTimeline: record.recordedTimeline,
        }
        : null;
      return selectedReplay;
    },
  };
}

/**
 * Saves only a completed, cleared BPM Challenge's original v2 recording.
 * @param {object} result Completed Challenge context.
 * @param {Storage|null} [storage] Optional LocalStorage-compatible backend.
 */
export function saveChallengeReplay(
  { chartId, run, analysis, outcome, recordedAt },
  storage,
) {
  if (
    !run || run.courseStageId ||
    !outcome?.ok || outcome.result?.status !== "counted" ||
    outcome.result.valid !== true || outcome.result.cleared !== true
  ) return { ok: false, reason: "not-cleared-challenge" };
  if (
    analysis?.eventModelVersion !== EVENT_MODEL_VERSION ||
    analysis.matching?.initialStateValid !== true ||
    analysis.bpm !== run.bpm ||
    !Array.isArray(analysis.recordedTimeline) ||
    !analysis.recordedTimeline.some((event) =>
      event?.type === "scratch" || event?.type === "fader"
    ) ||
    !Number.isFinite(run.startedAt) ||
    !Array.isArray(run.loopStates) ||
    run.loopStates.filter((loop) => loop?.phase === "recording").length !==
      RECORDING_LOOPS
  ) return { ok: false, reason: "invalid-recording" };

  return saveReplay({
    version: 1,
    chartId,
    eventModelVersion: analysis.eventModelVersion,
    bpm: run.bpm,
    recordedAt,
    replayContext: {
      recordingStartedAt: run.startedAt,
      recordingLoopCount: RECORDING_LOOPS,
      loopStates: run.loopStates,
    },
    recordedTimeline: analysis.recordedTimeline,
  }, storage);
}
