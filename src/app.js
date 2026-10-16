import { chartCatalog as chartDefinitions } from "./data/chart-catalog.js";
import {
  compileScoreData,
  deriveBuilderDirections,
} from "./domain/score-compiler.js";
import { legacyStepsToScore } from "./domain/builder-score.js";
import {
  getClickActions,
  getPlaybackEvent,
  getScratchActions,
  shouldSilenceScratch,
  updatePlaybackCursor,
} from "./domain/playback.js";
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
  return chartCatalog.find((chart) => chart.id === state.selectedChartId) ||
    chartCatalog[0];
}

function getBuilderChart() {
  const chart = getSelectedChart();
  return {
    ...chart,
    ...state.builderMetadata,
    ...(state.builderScoreData?.source || {}),
    steps: state.builderSteps,
    scoreData: state.builderScoreData,
    scoreGrid: {
      beatsPerBar: Number(state.builderBeat.split("/")[0]) * 4 /
        Number(state.builderBeat.split("/")[1]),
      ticksPerBar: state.builderTicksPerBar,
      totalTicks: state.builderSteps.length,
    },
  };
}

function getPlaybackChart() {
  return state.isBuilderPlayback ? getBuilderChart() : getSelectedChart();
}

const { initializeAudio, playClickSound, playScratch, silenceActiveScratch } =
  createScratchAudio(
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
  return state.builderScoreData?.source.score.length ??
    Math.ceil(state.builderSteps.length / state.builderTicksPerBar);
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
    scoreData: state.builderScoreData ||
      compileScoreData(createBuilderScoreDocument()),
    onStepClick: (index) => {
      actions.editBuilderStep(index, state.builderSelectedType);
      renderBuilder();
    },
  });
  renderBuilderScore();
}

function renderBuilderScore() {
  visualizer.renderBuilderScore(getBuilderChart(), state);
}

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

/**
 * Performs audio and click actions for the current playback step.
 * @param {object} chart Chart selected for this playback session.
 */
function playCurrentStep(chart) {
  const scoreData = chart.scoreData;
  const scoreGrid = scoreData || chart.scoreGrid;
  const clickActions = getClickActions(
    scoreGrid,
    state.currentStep,
    state.clickIntervalSteps,
    state.clickEnabled,
  );
  const { activeEvent, eventIndex } = getPlaybackEvent(
    scoreData,
    state.currentStep,
  );
  if (shouldSilenceScratch(activeEvent)) silenceActiveScratch();
  if (clickActions.shouldPlay) playClickSound(clickActions.isDownbeat);

  const scratchActions = getScratchActions(
    scoreData,
    chart.steps,
    state.currentStep,
    state.bpm,
    eventIndex,
  );
  if (scratchActions) {
    playScratch(
      scratchActions.soundType,
      scratchActions.startTick,
      scratchActions.strokeRunLength,
      scratchActions.options,
    );
  }
}

/**
 * Refreshes the visible score after the current playback tick.
 */
function renderPlaybackProgress() {
  if (state.isBuilderPlayback) {
    renderBuilderScore();
  } else {
    renderSelectedChart();
  }
}

/**
 * Processes one playback tick, then renders and advances or ends the cursor.
 */
function advancePlayback() {
  const chart = getPlaybackChart();
  if (!chart.steps.length) return;

  playCurrentStep(chart);
  renderPlaybackProgress();

  const cursor = updatePlaybackCursor(
    state.currentStep,
    chart.steps.length,
    state.repeat,
  );
  if (cursor.shouldStop) return stopPlayback();
  actions.setPlaybackState({ currentStep: cursor.currentStep });
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
    ? (60 / state.bpm) * chart.scoreGrid.beatsPerBar /
      chart.scoreGrid.ticksPerBar * 1000
    : (60000 / state.bpm) / 2;
  const timer = setInterval(() => {
    advancePlayback();
  }, noteLengthMs);
  actions.setPlaybackState({ timer });

  advancePlayback();
}

function syncChartJson() {
  editorUi.setJsonText(JSON.stringify(createBuilderScoreDocument(), null, 2));
  editor.setJsonStatus(
    "現在の譜面JSONです。編集後は「編集内容を反映」またはファイル保存ができます。",
    false,
  );
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
  const selectedChart = getSelectedChart();
  actions.loadBuilderChart(parsed, {
    name: selectedChart.name,
    difficulty: selectedChart.difficulty,
  });
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
  editor.setJsonStatus(
    "未反映の変更があります。反映してから保存すると最新データになります。",
    false,
  );
}

async function connectMIDI() {
  if (!navigator.requestMIDIAccess) {
    controls.renderMidiStatus(
      "このブラウザはWeb MIDI APIに対応していません。",
      "MIDIデバイスに接続できません。キーボード操作や手動生成で試してください。",
    );
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
          controls.renderMidiLog(
            `${log}\n記録中... ${state.midiRecord.length}件`,
          );
        } else {
          controls.renderMidiLog(`MIDI入力: ${log}`);
        }
      };
    });
  } catch (error) {
    const denied = error.name === "SecurityError" ||
      error.name === "NotAllowedError" || /permission/i.test(error.message);
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
  controls.renderMidiLog(
    state.recordingMidi
      ? "MIDI記録を開始しました。DJコントローラの入力を4カウント後から記録します。"
      : "記録を停止しました。",
  );
}

function compareMidiRecording() {
  if (!state.midiRecord.length) {
    controls.renderMidiLog("比較するMIDI記録がありません。");
    return;
  }

  const recordedCount =
    state.midiRecord.filter((item) => item.status >= 144).length;
  const expectedCount = getSelectedChart().steps.length;
  const similarity = Math.min(
    100,
    Math.round((recordedCount / expectedCount) * 100),
  );
  controls.renderMidiLog(
    `MIDI比較結果: ${recordedCount} / ${expectedCount} パターン一致 (${similarity}%)\n記録数: ${state.midiRecord.length}`,
  );
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
    actions.resizeBuilderPattern(barCount);
    renderBuilder();
  },
  onRandomPattern: (options) => {
    actions.generateRandomPattern(options);
    renderBuilder();
    setBuilderMode("manual");
  },
  onManualFill: () => {
    actions.fillBuilderAlternating();
    renderBuilder();
  },
  onImportJson: () => importChartJson(editorUi.getJsonText()),
  onExportJson: exportChartJson,
  onJsonEdit: markJsonEdited,
  onJsonFileText: (text) => importChartJson(text, "JSONファイル読み込みエラー"),
  onJsonFileReadError: (error) =>
    editor.setJsonStatus(`JSONファイル読み込みエラー: ${error.message}`, true),
});

controls.renderInitialControls(state, getBuilderBarCount());
render();
