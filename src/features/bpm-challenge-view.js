export function createBpmChallengeView({
  getChallengeChartKey,
  getActiveChallengeKey,
  getSelectedChart,
  challengeRepository,
  describeChallenge,
  challengeUi,
  describeSessionProgress,
  getChallengeSession,
  getBeginnerCourseStage,
  getTimingAnalysis,
  transport,
}) {
  return {
    renderChallengePanel() {
      const chartKey = getChallengeChartKey();
      const active = chartKey !== null &&
        getActiveChallengeKey() === chartKey;
      const view = describeChallenge({
        chartKey,
        progress: chartKey ? challengeRepository.get(chartKey) : undefined,
        active,
      });
      challengeUi.renderChallenge(view, getSelectedChart().name);
      challengeUi.renderTimingAnalysis(getTimingAnalysis(chartKey));
      challengeUi.renderChallengeProgress(
        describeSessionProgress(getChallengeSession()),
      );
      transport.setBpmLocked(
        active || Boolean(getBeginnerCourseStage()?.targetBpm),
      );
      return view;
    },
    setStatus(message) {
      challengeUi.renderChallengeStatus(message);
    },
  };
}
