import { legacyStepsToScore } from "../domain/builder-score.js";

export function createBuilderView({
  state,
  actions,
  editor,
  visualizer,
  getBuilderChart,
  getBuilderBarCount,
  updateTransportValues,
  compileScoreData,
  afterBuilderEdit,
}) {
  function createBuilderScoreDocument() {
    if (state.builderScoreData) return state.builderScoreData.source;

    return {
      name: state.builderMetadata.name,
      difficulty: state.builderMetadata.difficulty,
      beat: state.builderBeat,
      score: legacyStepsToScore(state.builderSteps, {
        directions: state.builderDirections,
        ticksPerBar: state.builderTicksPerBar,
      }),
    };
  }

  function renderBuilderScore() {
    visualizer.renderBuilderScore(getBuilderChart(), state);
  }

  return {
    createBuilderScoreDocument,
    renderBuilderScore,
    renderBuilder() {
      updateTransportValues();
      editor.renderBuilderEditor(state, {
        barCount: getBuilderBarCount(),
        scoreDocument: createBuilderScoreDocument(),
        scoreData: state.builderScoreData ||
          compileScoreData(createBuilderScoreDocument()),
        onStepClick: (index) => {
          actions.editBuilderStep(index, state.builderSelectedType);
          afterBuilderEdit();
        },
      });
      renderBuilderScore();
    },
  };
}
