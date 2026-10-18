export function createBeginnerCourseView({
  stages,
  getSelectedStageId,
  repository,
  getNextStageId,
  getSelectedChart,
  isSessionRunning,
  beginnerCourseUi,
  getMessage,
}) {
  function getStage(stageId = getSelectedStageId()) {
    return stages.find((stage) => stage.id === stageId) ?? null;
  }

  return {
    getStage,
    renderBeginnerCourse() {
      const progress = repository.progress;
      const selectedStage = getStage();
      const nextStageId = getNextStageId(progress);
      const stageIsAvailable = selectedStage &&
        (progress.completedStageIds.includes(selectedStage.id) ||
          selectedStage.id === nextStageId);
      beginnerCourseUi.renderBeginnerCourse({
        stages,
        completedStageIds: progress.completedStageIds,
        nextStageId,
        selectedStageId: getSelectedStageId(),
        message: getMessage(),
        canStart: Boolean(
          stageIsAvailable &&
            getSelectedChart().id === selectedStage.chartId &&
            !isSessionRunning(),
        ),
      });
    },
  };
}
