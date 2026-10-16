import assert from "node:assert/strict";
import { chartCatalog } from "../../src/data/chart-catalog.js";
import { compileScoreData } from "../../src/domain/score-compiler.js";
import { createActions } from "../../src/state/actions.js";
import { createInitialState, createStore } from "../../src/state/store.js";

function createTestApp() {
  const catalog = chartCatalog.map((chart) => {
    const scoreData = compileScoreData({
      name: chart.name,
      difficulty: chart.difficulty,
      beat: chart.beat,
      score: chart.score,
    });
    return { ...chart, scoreData, steps: scoreData.steps };
  });
  const store = createStore(createInitialState(catalog));
  return {
    catalog,
    state: store.getState(),
    actions: createActions(store),
  };
}

Deno.test("builder starts without a saved chart link or draft", () => {
  const { state } = createTestApp();
  assert.equal(state.builderSavedChartId, null);
  assert.equal(state.builderDraftActive, false);
});

Deno.test("setBuilderPersistence links a saved chart in one dispatch", () => {
  const { state, actions } = createTestApp();
  actions.setBuilderPersistence({ savedChartId: "abc", draftActive: true });
  assert.equal(state.builderSavedChartId, "abc");
  assert.equal(state.builderDraftActive, true);
});

Deno.test("builder edits keep the saved chart link", () => {
  const { catalog, state, actions } = createTestApp();
  actions.resetForChart(catalog[0]);
  actions.setBuilderPersistence({ savedChartId: "abc", draftActive: true });
  actions.editBuilderStep(0, "R");
  actions.resizeBuilderPattern(3);
  actions.fillBuilderAlternating();
  actions.loadBuilderChart({
    name: "Loaded",
    difficulty: "Easy",
    beat: "4/4",
    score: [["F", "B", "F", "B"]],
  });
  assert.equal(state.builderSavedChartId, "abc");
  assert.equal(state.builderDraftActive, true);
  assert.equal(state.builderMetadata.name, "Loaded");
});

Deno.test("resetting the page clears the saved chart link and draft", () => {
  const { catalog, state, actions } = createTestApp();
  actions.setBuilderPersistence({ savedChartId: "abc", draftActive: true });
  actions.resetForChart(catalog[0]);
  assert.equal(state.builderSavedChartId, null);
  assert.equal(state.builderDraftActive, false);
});
