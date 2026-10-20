import { getBestRun, updateBestRun } from "../domain/ghost-storage.js";
import { EVENT_MODEL_VERSION } from "../domain/performance-analysis.js";
import { createGhostOverlayData } from "../domain/ghost-overlay.js";

/**
 * Holds Ghost selection and enable state in memory, without rendering or saving.
 * @param {Storage|null} [storage] Optional LocalStorage-compatible backend.
 */
export function createGhostSelection(storage) {
  let selectedGhost = null;
  let enabled = false;
  const contexts = new Map();
  function selectChart(chartId) {
    const record = getBestRun(chartId, storage);
    selectedGhost = record
      ? {
        chartId: record.chartId,
        accuracy: record.accuracy,
        timingAccuracy: record.timingAccuracy,
        recordedTimeline: record.recordedTimeline,
      }
      : null;
    return selectedGhost;
  }
  return {
    get selectedGhost() {
      return selectedGhost;
    },
    get enabled() {
      return enabled;
    },
    enableGhost() {
      enabled = true;
    },
    disableGhost() {
      enabled = false;
    },
    toggleGhost() {
      enabled = !enabled;
    },
    isGhostEnabled() {
      return enabled;
    },
    selectChart,
    captureBestRunContext(chart, analysis) {
      const ghost = selectChart(chart.id);
      const timeline = analysis.recordedTimeline.filter((event) =>
        event.type === "scratch" || event.type === "fader"
      ).map((event) =>
        event.type === "scratch"
          ? { type: event.type, direction: event.direction, time: event.time }
          : { type: event.type, state: event.state, time: event.time }
      );
      if (
        !ghost || ghost.accuracy !== analysis.matching.accuracy ||
        ghost.timingAccuracy !== analysis.timing.timingAccuracy ||
        JSON.stringify(ghost.recordedTimeline) !== JSON.stringify(timeline)
      ) {
        console.warn(
          "Ghost recording context does not match the saved Best Run",
        );
        return;
      }
      contexts.set(chart.id, {
        signature: JSON.stringify(ghost),
        loops: structuredClone(analysis.loops),
        bpm: analysis.bpm,
        scoreData: chart.scoreData,
      });
    },
    getOverlayData(chart) {
      const context = contexts.get(chart.id);
      if (
        !selectedGhost || selectedGhost.chartId !== chart.id ||
        !context || context.scoreData !== chart.scoreData ||
        context.signature !== JSON.stringify(selectedGhost)
      ) return null;
      return createGhostOverlayData(
        selectedGhost,
        context.loops,
        context.bpm,
        chart.scoreData,
      );
    },
  };
}

/**
 * Saves only cleared BPM Challenge results from the completed v2 analysis.
 * @param {object} result Completed challenge context.
 * @param {Storage|null} [storage] Optional LocalStorage-compatible backend.
 */
export function saveChallengeGhost(
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
    !analysis.timing ||
    !Array.isArray(analysis.recordedTimeline) ||
    !analysis.recordedTimeline.some((event) =>
      event?.type === "scratch" || event?.type === "fader"
    ) ||
    analysis.bpm !== run.bpm
  ) return { ok: false, reason: "invalid-analysis" };

  return updateBestRun({
    chartId,
    eventModelVersion: analysis.eventModelVersion,
    bpm: run.bpm,
    accuracy: analysis.matching.accuracy,
    timingAccuracy: analysis.timing.timingAccuracy,
    recordedAt,
    recordedTimeline: analysis.recordedTimeline,
  }, storage);
}
