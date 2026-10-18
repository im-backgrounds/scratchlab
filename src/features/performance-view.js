import {
  analyzePerformanceLoops,
  createExpectedEvents,
} from "../domain/performance-analysis.js";

export function createPerformanceView({
  getSelectedChart,
  getLatestPerformance,
  performanceUi,
}) {
  function analyzeForChart(performance, chart) {
    return analyzePerformanceLoops(
      createExpectedEvents(chart.scoreData),
      performance.events,
      performance.loopEnds,
    );
  }

  return {
    analyzeForChart,
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
      );
    },
  };
}
