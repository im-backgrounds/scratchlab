import {
  analyzeTimelineTiming,
  createExpectedTimeline,
  EVENT_MODEL_VERSION,
  matchPerformanceTimeline,
} from "../domain/performance-analysis.js";
import { createPerformanceOverlay } from "../domain/performance-overlay.js";

export function analyzeRuntimePerformance(
  scoreData,
  events,
  loops,
  bpm,
  currentTick = null,
) {
  const expected = createExpectedTimeline(scoreData).filter((event) =>
    currentTick === null || event.tick <= currentTick
  );
  const matching = matchPerformanceTimeline(expected, events, loops);
  const timing = analyzeTimelineTiming(scoreData, matching, loops, bpm);
  const overlay = createPerformanceOverlay(
    expected,
    events,
    loops,
    matching,
    timing,
  );
  return {
    eventModelVersion: EVENT_MODEL_VERSION,
    recordedTimeline: events,
    expected,
    matching,
    timing,
    overlay,
    loops,
    bpm,
  };
}

export function createPerformanceView({
  getSelectedChart,
  getLatestPerformance,
  performanceUi,
}) {
  const runtime = new WeakMap();
  function getAnalysis(performance, chart) {
    const context = performance && runtime.get(performance);
    return context?.chartId === chart.id &&
        context.scoreData === chart.scoreData
      ? context.analysis
      : null;
  }
  function analyzeForChart(performance, chart) {
    return getAnalysis(performance, chart)?.matching ?? null;
  }

  function analyzeTimingForChart(performance, chart) {
    return getAnalysis(performance, chart)?.timing ?? null;
  }

  return {
    getAnalysis,
    setRuntime(performance, chart, events, loops, bpm) {
      if (performance.truncated) return null;
      const analysis = analyzeRuntimePerformance(
        chart.scoreData,
        events,
        loops,
        bpm,
      );
      runtime.set(performance, {
        chartId: chart.id,
        scoreData: chart.scoreData,
        analysis,
      });
      return analysis;
    },
    analyzeForChart,
    analyzeTimingForChart,
    renderPerformanceAnalysis() {
      const performance = getLatestPerformance();
      if (!performance) {
        performanceUi.renderPerformanceAnalysis(null, "");
        return;
      }
      const chart = getSelectedChart();
      performanceUi.renderPerformanceAnalysis(
        analyzeForChart(performance, chart),
        chart.name,
        performance.truncated
          ? "記録の上限を超えたためv2分析は行いません。短い記録で再挑戦してください。"
          : !getAnalysis(performance, chart)
          ? "この記録にはv2の境界・初期状態情報がありません。再挑戦するとv2で分析します。"
          : "",
      );
    },
  };
}
