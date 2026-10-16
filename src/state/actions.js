import {
  alternatingSteps,
  compileBuilderSteps,
  replaceBuilderStep,
  resizeSteps,
} from "../domain/builder-score.js";
import {
  compileScoreData,
  deriveBuilderDirections,
} from "../domain/score-compiler.js";

export function createActions(store) {
  const state = store.getState();
  const dispatch = (type, values = {}) => store.dispatch({ type, ...values });
  const commitBuilderState = (
    { scoreData, steps, directions, ticksPerBar, beat, metadata },
  ) => {
    dispatch("builder/set-state", {
      values: {
        builderScoreData: scoreData,
        builderSteps: steps,
        builderDirections: directions,
        builderTicksPerBar: ticksPerBar,
        builderBeat: beat,
        builderMetadata: metadata,
        builderJsonDirty: false,
      },
    });
  };
  const commitCompiledBuilderState = (
    scoreData,
    metadata = state.builderMetadata,
  ) => {
    commitBuilderState({
      scoreData,
      steps: scoreData.steps,
      directions: scoreData.directions,
      ticksPerBar: scoreData.ticksPerBar,
      beat: scoreData.beat,
      metadata,
    });
  };
  const compileBuilderUpdate = (steps, directions) =>
    compileBuilderSteps({
      name: state.builderMetadata.name,
      difficulty: state.builderMetadata.difficulty,
      beat: state.builderBeat,
      ticksPerBar: state.builderTicksPerBar,
      steps,
      directions,
    });

  return {
    selectChart: (chartId) => dispatch("chart/select", { chartId }),
    resetForChart: (chart) => dispatch("page/reset", { chart }),
    setBpm: (value) => dispatch("transport/set-bpm", { value }),
    setVolume: (value) => dispatch("transport/set-volume", { value }),
    setRepeat: (value) => dispatch("transport/set-repeat", { value }),
    setClickEnabled: (value) =>
      dispatch("transport/set-click-enabled", { value }),
    setClickInterval: (value) =>
      dispatch("transport/set-click-interval", { value }),
    setClickVolume: (value) =>
      dispatch("transport/set-click-volume", { value }),
    setBuilderMode: (mode) => dispatch("builder/set-mode", { mode }),
    setBuilderSelectedType: (stepType) =>
      dispatch("builder/set-selected-type", { stepType }),
    setBuilderJsonDirty: (value) =>
      dispatch("builder/set-json-dirty", { value }),
    setBuilderPersistence: ({ savedChartId, draftActive }) =>
      dispatch("builder/set-state", {
        values: {
          builderSavedChartId: savedChartId,
          builderDraftActive: draftActive,
        },
      }),
    editBuilderStep: (index, stepType) => {
      const { steps, directions } = replaceBuilderStep(
        state.builderSteps,
        state.builderDirections,
        index,
        stepType,
      );
      commitCompiledBuilderState(compileBuilderUpdate(steps, directions));
    },
    resizeBuilderPattern: (barCount) => {
      const { steps, directions } = resizeSteps(
        state.builderSteps,
        barCount * state.builderTicksPerBar,
      );
      commitCompiledBuilderState(compileBuilderUpdate(steps, directions));
    },
    fillBuilderAlternating: () => {
      const { steps, directions } = alternatingSteps(state.builderSteps.length);
      commitCompiledBuilderState(compileBuilderUpdate(steps, directions));
    },
    loadBuilderChart: (parsed, fallbackMetadata = state.builderMetadata) => {
      if (parsed && Array.isArray(parsed.score)) {
        const scoreData = compileScoreData(parsed);
        commitCompiledBuilderState(scoreData, {
          name: parsed.name,
          difficulty: parsed.difficulty,
        });
        return;
      }
      if (parsed && Array.isArray(parsed.steps)) {
        if (!parsed.steps.length) {
          throw new Error("steps配列を空にできません。");
        }
        const steps = [...parsed.steps];
        const directions = deriveBuilderDirections(steps);
        commitBuilderState({
          scoreData: null,
          steps,
          directions,
          ticksPerBar: 8,
          beat: "4/4",
          metadata: {
            name: parsed.name || fallbackMetadata.name,
            difficulty: parsed.difficulty || fallbackMetadata.difficulty,
          },
        });
        return;
      }
      throw new Error("score配列を持つ譜面データが必要です。");
    },
    generateRandomPattern: (
      {
        difficulty,
        minimumBeat,
        includeTriplets,
        includeSyncopation,
        includeChops,
        includeFlares,
        includeKeeps,
      },
    ) => {
      const [numerator, denominator] = state.builderBeat.split("/").map(Number);
      const beatsPerBar = numerator * 4 / denominator;
      const baseEventCount = Math.max(1, Math.floor(beatsPerBar / minimumBeat));
      const barCount = state.builderScoreData?.source.score.length ??
        Math.ceil(state.builderSteps.length / state.builderTicksPerBar);
      const bars = [];
      let lastDirection = "B";
      let faderOpen = true;

      for (let bar = 0; bar < barCount; bar += 1) {
        const tripletIndex = includeTriplets
          ? Math.floor(Math.random() * baseEventCount)
          : -1;
        const events = [];
        for (let index = 0; index < baseEventCount; index += 1) {
          const tripletCount = index === tripletIndex ? 3 : 1;
          const tokens = [];
          for (
            let subdivision = 0;
            subdivision < tripletCount;
            subdivision += 1
          ) {
            const beatPosition = index * minimumBeat +
              subdivision * minimumBeat / tripletCount;
            const isStrongBeat =
              Math.abs(beatPosition - Math.round(beatPosition)) < 0.001;
            if (
              includeSyncopation && isStrongBeat && (bar > 0 || index > 0) &&
              Math.random() < 0.45
            ) {
              tokens.push(`${lastDirection}M`);
              faderOpen = false;
              continue;
            }

            if (
              includeKeeps &&
              Math.random() < (difficulty === "Hard" ? 0.16 : 0.1)
            ) {
              tokens.push("K");
              continue;
            }

            const techniqueRoll = Math.random();
            const techniqueChance = difficulty === "Hard"
              ? 0.34
              : difficulty === "Medium"
              ? 0.2
              : 0.1;
            if (includeChops && techniqueRoll < techniqueChance / 2) {
              tokens.push(`${lastDirection}C`);
              faderOpen = true;
            } else if (includeFlares && techniqueRoll < techniqueChance) {
              tokens.push(`${lastDirection}F`);
              faderOpen = true;
            } else {
              lastDirection = difficulty === "Easy" && Math.random() < 0.72
                ? (lastDirection === "F" ? "B" : "F")
                : (Math.random() < 0.5 ? "F" : "B");
              tokens.push(`${lastDirection}${faderOpen ? "" : "O"}`);
              faderOpen = true;
            }
          }
          events.push(tripletCount === 3 ? tokens : tokens[0]);
        }
        bars.push(events);
      }

      const generated = compileScoreData({
        name: "ランダム生成譜面",
        difficulty,
        beat: state.builderBeat,
        score: bars,
      });
      commitCompiledBuilderState(generated, {
        name: generated.source.name,
        difficulty,
      });
      return generated;
    },
    setPlaybackState: (values) => dispatch("playback/set-state", { values }),
    setAudioResources: (values) => dispatch("audio/set-resources", { values }),
    setMidiState: (values) => dispatch("midi/set-state", { values }),
    recordMidiEvent: (event) => dispatch("midi/record-event", { event }),
    recordMidiAction: (event) => dispatch("midi/record-action", { event }),
    clearMidiRecord: () => dispatch("midi/clear-record"),
  };
}
