import { analyzeRuntimePerformance } from "./performance-view.js";
import { createExpectedTimeline } from "../domain/performance-analysis.js";

export function createPracticeView({
  state,
  getSelectedChart,
  visualizer,
  performanceUi,
  getLatestPerformance,
  getAnalysis,
  getPlaybackSnapshot,
  renderBuilderScore,
  getGhostOverlayData = () => null,
}) {
  function renderControllerOverlay(chart = getSelectedChart()) {
    const ghost = getGhostOverlayData(chart);
    const snapshot = getPlaybackSnapshot();
    if (
      (state.isPlaying || snapshot.events.length > 0) &&
      !state.isBuilderPlayback &&
      snapshot.startedAt !== null
    ) {
      const now = snapshot.stoppedAt ?? Date.now();
      const expected = createExpectedTimeline(chart.scoreData);
      const playback = {
        progress: Math.min(
          100,
          (now - snapshot.startedAt) /
            (chart.scoreData.totalTicks * chart.scoreData.tickDurationSeconds *
              60000 / state.bpm) *
            100,
        ),
        isPlaying: state.isPlaying,
        isDemo: snapshot.loopState.phase === "demo",
      };
      if (playback.isDemo) {
        performanceUi.renderControllerOverlay(
          chart.scoreData,
          null,
          playback,
          expected,
          ghost,
        );
        return;
      }
      const tickMs = chart.scoreData.tickDurationSeconds * 60000 / state.bpm;
      const endTime = Math.max(snapshot.startedAt + 0.001, now + 0.001);
      const currentTick = Math.min(
        chart.scoreData.totalTicks,
        (now - snapshot.startedAt) / tickMs,
      );
      const bundle = analyzeRuntimePerformance(
        chart.scoreData,
        snapshot.events.filter((event) => event.time < endTime).toSorted((
          a,
          b,
        ) => a.time - b.time),
        [{ ...snapshot.loopState, endTime }],
        state.bpm,
        currentTick,
      );
      performanceUi.renderControllerOverlay(
        chart.scoreData,
        bundle,
        playback,
        expected,
        ghost,
      );
      return;
    }
    const performance = getLatestPerformance();
    performanceUi.renderControllerOverlay(
      chart.scoreData,
      getAnalysis(performance, chart),
      null,
      createExpectedTimeline(chart.scoreData),
      ghost,
    );
  }

  return {
    renderControllerOverlay,
    renderSelectedChart() {
      const chart = getSelectedChart();
      visualizer.renderSelectedChart(chart, state);
      renderControllerOverlay(chart);
    },
    renderPlaybackProgress() {
      if (state.isBuilderPlayback) {
        renderBuilderScore();
      } else {
        visualizer.renderSelectedChart(getSelectedChart(), state);
        renderControllerOverlay(getSelectedChart());
      }
    },
  };
}
