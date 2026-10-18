export function createPracticeView({
  state,
  getSelectedChart,
  visualizer,
  performanceUi,
  getLatestPerformance,
  analyzeForChart,
  getPlaybackSnapshot,
  renderBuilderScore,
}) {
  function renderControllerOverlay(chart = getSelectedChart()) {
    const snapshot = getPlaybackSnapshot();
    if (
      (state.isPlaying || snapshot.events.length > 0) &&
      !state.isBuilderPlayback &&
      snapshot.startedAt !== null
    ) {
      performanceUi.renderControllerOverlay(chart.scoreData, null, null, {
        currentStep: state.isPlaying ? state.currentStep : snapshot.currentStep,
        isPlaying: state.isPlaying,
        startedAt: snapshot.startedAt,
        now: Date.now(),
        bpm: state.bpm,
        loopNumber: snapshot.loopNumber,
        events: snapshot.events,
      });
      return;
    }
    const performance = getLatestPerformance();
    performanceUi.renderControllerOverlay(
      chart.scoreData,
      performance,
      performance ? analyzeForChart(performance, chart) : null,
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
