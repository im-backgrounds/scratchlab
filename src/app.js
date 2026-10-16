import { chartCatalog as chartDefinitions } from "./data/chart-catalog.js";
import { compileScoreData, deriveBuilderDirections } from "./domain/score-compiler.js";
import { createScratchAudio } from "./audio/scratch-audio.js";
import { createActions } from "./state/actions.js";
import { createInitialState, createStore } from "./state/store.js";
import * as controls from "./ui/controls.js";
import * as transport from "./ui/transport.js";
import * as editor from "./ui/editor.js";
import * as visualizer from "./ui/visualizer.js";

const chartCatalog = chartDefinitions.map((chart) => {
  const source = {
    name: chart.name,
    difficulty: chart.difficulty,
    beat: chart.beat,
    score: chart.score,
  };
  const scoreData = compileScoreData(source);
  return { ...chart, scoreData, steps: scoreData.steps };
});

const store = createStore(createInitialState(chartCatalog));
const actions = createActions(store);
const state = store.getState();
let editorUi;

function getSelectedChart() {
  return chartCatalog.find((chart) => chart.id === state.selectedChartId) || chartCatalog[0];
}

function getBuilderChart() {
  const chart = getSelectedChart();
  return {
    ...chart,
    ...state.builderMetadata,
    ...(state.builderScoreData?.source || {}),
    scoreMode: state.builderScoreData ? "score-data" : state.builderScoreMode,
    singleStrokePerStep: state.builderScoreMode === "forward" || state.builderScoreMode === "backward",
    steps: state.builderSteps,
    scoreData: state.builderScoreData,
    scoreGrid: {
      beatsPerBar: Number(state.builderBeat.split("/")[0]) * 4 / Number(state.builderBeat.split("/")[1]),
      ticksPerBar: state.builderTicksPerBar,
      totalTicks: state.builderSteps.length,
    },
  };
}

function getPlaybackChart() {
  return state.isBuilderPlayback ? getBuilderChart() : getSelectedChart();
}

const { initializeAudio, playClickSound, playScratch, silenceActiveScratch } = createScratchAudio(
  state,
  getPlaybackChart,
  actions.setAudioResources,
);

function renderSelectedChart() {
  visualizer.renderSelectedChart(getSelectedChart(), state);
}

function showPracticeView() {
  controls.renderPracticeView();
}

function showBuilderPage() {
  controls.renderBuilderView();
}

function resetPageState() {
  stopPlayback();
  const selectedChart = getSelectedChart();
  actions.resetForChart(selectedChart);

  controls.renderResetControls(state);
  setBuilderMode("random");

  render();
}

function updateTransportValues() {
  transport.renderTransport(state, getBuilderBarCount());
}

function getBuilderBarCount() {
  return state.builderScoreData?.source.score.length
    ?? Math.ceil(state.builderSteps.length / state.builderTicksPerBar);
}

function setBuilderMode(mode) {
  actions.setBuilderMode(mode);
  editor.renderBuilderMode(mode);
  if (mode === "json" && !state.builderJsonDirty) syncChartJson();
}

function renderBuilder() {
  updateTransportValues();
  editor.renderBuilderEditor(state, {
    barCount: getBuilderBarCount(),
    scoreDocument: createBuilderScoreDocument(),
    scoreData: state.builderScoreData || compileScoreData(createBuilderScoreDocument()),
    onStepClick: (index) => {
      actions.setBuilderStep(index, state.builderSelectedType);
      recompileBuilderScore();
      actions.setBuilderJsonDirty(false);
      renderBuilder();
    },
  });
  renderBuilderScore();
}

function renderBuilderScore() {
  visualizer.renderBuilderScore(getBuilderChart(), state);
}

function legacyStepsToScore(chart, steps) {
  if (chart.scoreMode === "transformer") {
    return [["FC3", "BC3"], ["FC3", "BC3"]];
  }

  let lastDirection = chart.scoreMode === "backward" ? "B" : "F";
  let faderOpen = true;
  const tokens = steps.map((step, index) => {
    if (step === "L") {
      lastDirection = "F";
      if (!faderOpen) {
        faderOpen = true;
        return "FO";
      }
      return "F";
    }
    if (step === "R") {
      lastDirection = "B";
      if (!faderOpen) {
        faderOpen = true;
        return "BO";
      }
      return "B";
    }
    if (step === "M") {
      const direction = state.builderDirections[index] || lastDirection;
      if (direction) lastDirection = direction;
      faderOpen = false;
      return `${lastDirection}M`;
    }
    if (step === "C") {
      faderOpen = true;
      return `${lastDirection}C`;
    }
    if (step === "S") {
      faderOpen = true;
      return `${lastDirection}C3`;
    }
    if (step === "P") {
      faderOpen = true;
      return `${lastDirection}F`;
    }
    if (step === "K") {
      return "K";
    }
    const token = faderOpen ? lastDirection : `${lastDirection}O`;
    faderOpen = true;
    return token;
  });

  const score = [];
  for (let index = 0; index < tokens.length; index += state.builderTicksPerBar) {
    score.push(tokens.slice(index, index + state.builderTicksPerBar));
  }
  return score;
}

function createBuilderScoreDocument() {
  if (state.builderScoreData) return state.builderScoreData.source;

  const chart = getSelectedChart();
  return {
    name: state.builderMetadata.name,
    difficulty: state.builderMetadata.difficulty,
    beat: state.builderBeat,
    score: legacyStepsToScore(chart, state.builderSteps),
  };
}

function recompileBuilderScore() {
  const chart = getSelectedChart();
  const source = {
    name: state.builderMetadata.name,
    difficulty: state.builderMetadata.difficulty,
    beat: state.builderBeat,
    score: legacyStepsToScore({ ...chart, scoreMode: null }, state.builderSteps),
  };
  const compiled = compileScoreData(source);
  actions.setBuilderState({
    builderScoreMode: null,
    builderScoreData: compiled,
    builderSteps: compiled.steps,
    builderDirections: compiled.directions,
    builderTicksPerBar: compiled.ticksPerBar,
    builderBeat: compiled.beat,
  });
}

function render() {
  visualizer.renderChartList(chartCatalog, state.selectedChartId, (chartId) => {
    actions.selectChart(chartId);
    showPracticeView();
    resetPageState();
  });
  renderSelectedChart();
  renderBuilder();
  updateTransportValues();
}

function getStrokeRunLength(steps, stepIndex) {
  const stroke = steps[stepIndex];
  if (stroke !== "L" && stroke !== "R") {
    return 1;
  }

  let runLength = 1;
  while (steps[stepIndex + runLength] === stroke) {
    runLength += 1;
  }
  return runLength;
}

function advancePlayback() {
  const chart = getPlaybackChart();
  if (!chart.steps.length) {
    return;
  }

  const currentType = chart.steps[state.currentStep];
  const scoreData = chart.scoreData;
  const scoreGrid = scoreData || chart.scoreGrid;
  const ticksPerQuarter = scoreGrid ? scoreGrid.ticksPerBar / scoreGrid.beatsPerBar : 2;
  const clickInterval = scoreGrid
    ? Math.max(1, Math.round(ticksPerQuarter * state.clickIntervalSteps / 2))
    : state.clickIntervalSteps;
  const isDownbeat = scoreGrid
    ? state.currentStep % scoreGrid.ticksPerBar === 0
    : state.currentStep % 8 === 0;
  const scoreEvent = scoreData?.events.find((event) => (
    event.startTick <= state.currentStep
    && state.currentStep < event.startTick + event.durationTicks
  ));
  const isKeepInterval = scoreEvent?.keep === true;
  if (isKeepInterval) silenceActiveScratch();
  if (state.clickEnabled && state.currentStep % clickInterval === 0) {
    playClickSound(isDownbeat);
  }
  if (scoreData) {
    const events = scoreData.events;
    const eventIndex = events.findIndex((scoreEvent) => scoreEvent.startTick === state.currentStep);
    if (eventIndex >= 0) {
      const event = events[eventIndex];
      if (event.faderOpen && !event.keep) {
        const canMerge = (candidate) => candidate.faderOpen && !candidate.keep && candidate.cutCount === 0;
        let runStartIndex = eventIndex;
        let runEndIndex = eventIndex;
        let runStartTick = event.startTick;
        let runEndTick = event.startTick + event.durationTicks;

        const continuesFlareTail = (candidate) => candidate.modifier === "";
        let followsFlare = false;
        if (continuesFlareTail(event)) {
          let previousIndex = eventIndex - 1;
          let previousEndTick = event.startTick;
          while (previousIndex >= 0) {
            const previous = events[previousIndex];
            if (!previous.faderOpen || previous.keep || previous.direction !== event.direction || previous.startTick + previous.durationTicks !== previousEndTick) break;
            if (previous.modifier === "F") {
              followsFlare = true;
              break;
            }
            if (!continuesFlareTail(previous)) break;
            previousEndTick = previous.startTick;
            previousIndex -= 1;
          }
        }

        if (event.modifier === "F") {
          while (runEndIndex + 1 < events.length) {
            const next = events[runEndIndex + 1];
            if (next.keep || !continuesFlareTail(next) || !next.faderOpen || next.direction !== event.direction || next.startTick !== runEndTick) break;
            runEndIndex += 1;
            runEndTick = next.startTick + next.durationTicks;
          }
        } else if (!followsFlare && canMerge(event)) {
          while (runStartIndex > 0) {
            const previous = events[runStartIndex - 1];
            if (!canMerge(previous) || previous.direction !== event.direction || previous.startTick + previous.durationTicks !== runStartTick) break;
            runStartIndex -= 1;
            runStartTick = previous.startTick;
          }
          while (runEndIndex + 1 < events.length) {
            const next = events[runEndIndex + 1];
            if (!canMerge(next) || next.direction !== event.direction || next.startTick !== runEndTick) break;
            runEndIndex += 1;
            runEndTick = next.startTick + next.durationTicks;
          }
        }

        if (!followsFlare && eventIndex === runStartIndex) {
          const direction = event.direction === "F" ? -1 : 1;
          const soundType = event.modifier === "C" ? "C" : event.modifier === "F" ? "F" : direction < 0 ? "L" : "R";
          const durationTicks = runEndTick - runStartTick;
          const durationSeconds = durationTicks * scoreData.tickDurationSeconds * 60 / state.bpm;
          playScratch(soundType, runStartTick, 1, {
            direction,
            durationSeconds,
            cutCount: event.cutCount,
            suppressFriction: runEndIndex > eventIndex,
          });
        }
      }
    }
  } else if (chart.scoreMode === "transformer") {
    const strokeLength = chart.strokeLength || 4;
    if (state.currentStep % strokeLength === 0) {
      playScratch("S", state.currentStep, strokeLength);
    }
  } else {
    const previousType = chart.steps[state.currentStep - 1];
    const continuesStroke = !chart.singleStrokePerStep && (currentType === "L" || currentType === "R") && currentType === previousType;
    if (!continuesStroke) {
      const runLength = chart.singleStrokePerStep ? 1 : getStrokeRunLength(chart.steps, state.currentStep);
      playScratch(currentType, state.currentStep, runLength);
    }
  }

  if (state.isBuilderPlayback) {
    renderBuilderScore();
  } else {
    renderSelectedChart();
  }

  if (state.currentStep >= chart.steps.length - 1) {
    if (state.repeat) {
      actions.setPlaybackState({ currentStep: 0 });
    } else {
      stopPlayback();
      return;
    }
  } else {
    actions.setPlaybackState({ currentStep: state.currentStep + 1 });
  }
}

function stopPlayback() {
  const wasBuilderPlayback = state.isBuilderPlayback;
  if (state.timer) {
    clearInterval(state.timer);
  }
  actions.setPlaybackState({ isPlaying: false, currentStep: 0, timer: null });
  controls.setPlaybackButton(false);
  if (wasBuilderPlayback) {
    renderBuilderScore();
  } else {
    renderSelectedChart();
  }
  actions.setPlaybackState({ isBuilderPlayback: false });
}

function startPlayback(isBuilderPlayback = false) {
  initializeAudio();
  actions.setPlaybackState({ isBuilderPlayback });
  const chart = getPlaybackChart();
  if (!chart.steps.length) {
    return;
  }

  actions.setPlaybackState({ isPlaying: true });
  controls.setPlaybackButton(true);

  if (state.timer) {
    clearInterval(state.timer);
  }

  const noteLengthMs = chart.scoreData
    ? chart.scoreData.tickDurationSeconds * (60000 / state.bpm)
    : chart.scoreGrid
      ? (60 / state.bpm) * chart.scoreGrid.beatsPerBar / chart.scoreGrid.ticksPerBar * 1000
      : (60000 / state.bpm) / 2;
  const timer = setInterval(() => {
    advancePlayback();
  }, noteLengthMs);
  actions.setPlaybackState({ timer });

  advancePlayback();
}

function syncChartJson() {
  editorUi.setJsonText(JSON.stringify(createBuilderScoreDocument(), null, 2));
  actions.setBuilderJsonDirty(false);
  editor.setJsonStatus("現在の譜面JSONです。編集後は「編集内容を反映」またはファイル保存ができます。", false);
}

function exportChartJson() {
  let data;
  try {
    if (state.builderJsonDirty) {
      const edited = JSON.parse(editorUi.getJsonText());
      compileScoreData(edited);
      data = JSON.stringify(edited, null, 2);
    } else {
      data = JSON.stringify(createBuilderScoreDocument(), null, 2);
    }
  } catch (error) {
    editor.setJsonStatus(`保存できません: ${error.message}`, true);
    return;
  }

  const filename = (state.builderMetadata.name || "scratch-chart")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "scratch-chart";
  editorUi.downloadJson(data, `${filename}.json`);
  editor.setJsonStatus("譜面JSONをファイルに保存しました。", false);
}

function loadChartJson(parsed) {
  if (parsed && Array.isArray(parsed.score)) {
    const compiled = compileScoreData(parsed);
    actions.setBuilderState({
      builderScoreData: compiled,
      builderSteps: compiled.steps,
      builderDirections: compiled.directions,
      builderBeat: compiled.beat,
      builderTicksPerBar: compiled.ticksPerBar,
      builderScoreMode: null,
      builderMetadata: { name: parsed.name, difficulty: parsed.difficulty },
    });
  } else if (parsed && Array.isArray(parsed.steps)) {
    actions.setBuilderState({
      builderSteps: [...parsed.steps],
      builderDirections: deriveBuilderDirections(parsed.steps),
      builderBeat: "4/4",
      builderTicksPerBar: 8,
      builderScoreMode: null,
      builderScoreData: null,
      builderMetadata: {
        name: parsed.name || getSelectedChart().name,
        difficulty: parsed.difficulty || getSelectedChart().difficulty,
      },
    });
  } else {
    throw new Error("score配列を持つ譜面データが必要です。");
  }
  actions.setBuilderJsonDirty(false);
  renderBuilder();
  editor.setJsonStatus("JSONを譜面に反映しました。", false);
}

function importChartJson(jsonText, errorPrefix = "JSONエラー") {
  try {
    loadChartJson(JSON.parse(jsonText));
  } catch (error) {
    editor.setJsonStatus(`${errorPrefix}: ${error.message}`, true);
  }
}

function markJsonEdited() {
  actions.setBuilderJsonDirty(true);
  editor.setJsonStatus("未反映の変更があります。反映してから保存すると最新データになります。", false);
}

async function connectMIDI() {
  if (!navigator.requestMIDIAccess) {
    controls.renderMidiStatus("このブラウザはWeb MIDI APIに対応していません。", "MIDIデバイスに接続できません。キーボード操作や手動生成で試してください。");
    return;
  }

  try {
    const access = await navigator.requestMIDIAccess();
    actions.setMidiState({ midiAccess: access, midiConnected: true });
    controls.renderMidiConnectionStatus("MIDI接続済み");

    access.inputs.forEach((input) => {
      input.onmidimessage = (event) => {
        const [status, note, velocity] = event.data;
        const log = `status=${status}, note=${note}, velocity=${velocity}`;
        actions.recordMidiEvent({ status, note, velocity, time: Date.now() });

        if (state.recordingMidi) {
          controls.renderMidiLog(`${log}\n記録中... ${state.midiRecord.length}件`);
        } else {
          controls.renderMidiLog(`MIDI入力: ${log}`);
        }
      };
    });
  } catch (error) {
    const denied = error.name === "SecurityError" || error.name === "NotAllowedError" || /permission/i.test(error.message);
    const log = denied
      ? `${error.message}\nVS Code内蔵ブラウザではWeb MIDIの権限が許可されません。Chrome/Edgeで http://localhost などから開いて、MIDIの許可を「許可」にしてください。`
      : error.message;
    controls.renderMidiStatus("MIDI接続に失敗しました", log);
  }
}

function toggleMidiRecording() {
  actions.setMidiState({ recordingMidi: !state.recordingMidi });
  actions.clearMidiRecord();
  controls.renderMidiRecording(state.recordingMidi);
  controls.renderMidiLog(state.recordingMidi
    ? "MIDI記録を開始しました。DJコントローラの入力を4カウント後から記録します。"
    : "記録を停止しました。");
}

function compareMidiRecording() {
  if (!state.midiRecord.length) {
    controls.renderMidiLog("比較するMIDI記録がありません。");
    return;
  }

  const recordedCount = state.midiRecord.filter((item) => item.status >= 144).length;
  const expectedCount = getSelectedChart().steps.length;
  const similarity = Math.min(100, Math.round((recordedCount / expectedCount) * 100));
  controls.renderMidiLog(`MIDI比較結果: ${recordedCount} / ${expectedCount} パターン一致 (${similarity}%)\n記録数: ${state.midiRecord.length}`);
}

controls.bindControls({
  onShowGuide: () => {
    resetPageState();
    if (state.isPlaying) stopPlayback();
    controls.renderGuideView();
  },
  onShowBuilder: () => {
    resetPageState();
    showBuilderPage();
  },
  onConnectMidi: connectMIDI,
  onToggleMidiRecording: toggleMidiRecording,
  onCompareMidi: compareMidiRecording,
});

transport.bindTransport({
  onPlay: (isBuilderPlayback) => {
    if (state.isPlaying) stopPlayback();
    else startPlayback(isBuilderPlayback);
  },
  onBpmChange: (value) => {
    actions.setBpm(value);
    updateTransportValues();
    if (state.isPlaying) startPlayback(state.isBuilderPlayback);
  },
  onVolumeChange: (value) => {
    actions.setVolume(value);
    updateTransportValues();
  },
  onRepeatChange: actions.setRepeat,
  onClickEnabledChange: actions.setClickEnabled,
  onClickIntervalChange: actions.setClickInterval,
  onClickVolumeChange: (value) => {
    actions.setClickVolume(value);
    updateTransportValues();
  },
});

editorUi = editor.bindEditor({
  onModeChange: setBuilderMode,
  onStepTypeChange: (stepType) => {
    actions.setBuilderSelectedType(stepType);
    editor.renderStepTypeSelection(stepType);
    editor.renderBuilderToolHint(stepType);
  },
  onPatternLengthChange: (barCount) => {
    actions.resizeBuilderSteps(barCount * state.builderTicksPerBar);
    recompileBuilderScore();
    actions.setBuilderJsonDirty(false);
    renderBuilder();
  },
  onRandomPattern: (options) => {
    actions.generateRandomPattern(options);
    renderBuilder();
    setBuilderMode("manual");
  },
  onManualFill: () => {
    actions.fillBuilderAlternating();
    recompileBuilderScore();
    actions.setBuilderJsonDirty(false);
    renderBuilder();
  },
  onImportJson: () => importChartJson(editorUi.getJsonText()),
  onExportJson: exportChartJson,
  onJsonEdit: markJsonEdited,
  onJsonFileText: (text) => importChartJson(text, "JSONファイル読み込みエラー"),
  onJsonFileReadError: (error) => editor.setJsonStatus(`JSONファイル読み込みエラー: ${error.message}`, true),
});

controls.renderInitialControls(state, getBuilderBarCount());
render();
