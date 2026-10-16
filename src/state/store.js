const initialTransportState = {
  bpm: 110,
  volume: 0.8,
  repeat: true,
  clickEnabled: true,
  clickIntervalSteps: 2,
  clickVolume: 0.5,
};

export function createInitialState(chartCatalog) {
  const chart = chartCatalog[0];
  return protectCollections({
    selectedChartId: "baby-scratch",
    ...initialTransportState,
    isPlaying: false,
    currentStep: 0,
    timer: null,
    audioContext: null,
    scratchBuffers: null,
    builderSteps: [...chart.steps],
    builderScoreData: null,
    builderMetadata: { name: chart.name, difficulty: chart.difficulty },
    builderJsonDirty: false,
    builderActiveMode: "random",
    builderBeat: "4/4",
    builderTicksPerBar: 8,
    builderDirections: chart.steps.map((step) => (step === "R" ? "B" : "F")),
    builderSelectedType: "L",
    isBuilderPlayback: false,
    midiStatus: "MIDI未接続",
    midiAccess: null,
    midiConnected: false,
    midiRecord: [],
    recordingMidi: false,
  });
}

function protectCollections(values) {
  const protectedValues = { ...values };
  ["builderSteps", "builderDirections", "midiRecord"].forEach((key) => {
    if (Array.isArray(protectedValues[key]) && !Object.isFrozen(protectedValues[key])) {
      Object.freeze(protectedValues[key]);
    }
  });
  if (protectedValues.builderMetadata && !Object.isFrozen(protectedValues.builderMetadata)) {
    Object.freeze(protectedValues.builderMetadata);
  }
  return protectedValues;
}

function reduceState(state, action) {
  switch (action.type) {
    case "chart/select":
      return { selectedChartId: action.chartId };
    case "page/reset":
      return {
        ...initialTransportState,
        builderSteps: [...action.chart.steps],
        builderScoreData: action.chart.scoreData,
        builderMetadata: { name: action.chart.name, difficulty: action.chart.difficulty },
        builderJsonDirty: false,
        builderActiveMode: "random",
        builderBeat: action.chart.beat,
        builderTicksPerBar: action.chart.scoreData.ticksPerBar,
        builderDirections: [...action.chart.scoreData.directions],
        builderSelectedType: "L",
        midiRecord: [],
        recordingMidi: false,
      };
    case "transport/set-bpm":
      return { bpm: action.value };
    case "transport/set-volume":
      return { volume: action.value };
    case "transport/set-repeat":
      return { repeat: action.value };
    case "transport/set-click-enabled":
      return { clickEnabled: action.value };
    case "transport/set-click-interval":
      return { clickIntervalSteps: action.value };
    case "transport/set-click-volume":
      return { clickVolume: action.value };
    case "builder/set-mode":
      return { builderActiveMode: action.mode };
    case "builder/set-selected-type":
      return { builderSelectedType: action.stepType };
    case "builder/set-json-dirty":
      return { builderJsonDirty: action.value };
    case "builder/set-state":
      return action.values;
    case "playback/set-state":
      return action.values;
    case "audio/set-resources":
      return action.values;
    case "midi/set-state":
      return action.values;
    case "midi/record-event":
      return { midiRecord: [...state.midiRecord, action.event] };
    case "midi/clear-record":
      return { midiRecord: [] };
    default:
      throw new Error(`Unknown state action: ${action.type}`);
  }
}

export function createStore(initialState) {
  let state = protectCollections(initialState);
  const stateView = {};
  Object.keys(state).forEach((key) => {
    Object.defineProperty(stateView, key, {
      enumerable: true,
      get: () => state[key],
    });
  });
  Object.freeze(stateView);

  return {
    getState() {
      return stateView;
    },
    dispatch(action) {
      Object.assign(state, protectCollections(reduceState(state, action)));
      return stateView;
    },
  };
}
