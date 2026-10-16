import { chartCatalog as chartDefinitions } from "./data/chart-catalog.js";
import {
  compileScoreData,
  deriveBuilderDirections,
} from "./domain/score-compiler.js";
import { legacyStepsToScore } from "./domain/builder-score.js";
import {
  createChartRepository,
  getBrowserStorage,
  MAX_SAVED_CHARTS,
} from "./domain/chart-storage.js";
import { createPlaybackController } from "./domain/playback-controller.js";
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
import * as savedCharts from "./ui/saved-charts.js";
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
const repository = createChartRepository(getBrowserStorage());
let editorUi;
let currentView = "practice";
let renamingChartId = null;

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
const playbackController = createPlaybackController();

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
      afterBuilderEdit();
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
    currentView = "practice";
    persistSession();
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
  playbackController.stop();
  actions.setPlaybackState({ isPlaying: false, currentStep: 0 });
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

  const noteLengthMs = chart.scoreData
    ? chart.scoreData.tickDurationSeconds * (60000 / state.bpm)
    : chart.scoreGrid
    ? (60 / state.bpm) * chart.scoreGrid.beatsPerBar /
      chart.scoreGrid.ticksPerBar * 1000
    : (60000 / state.bpm) / 2;
  playbackController.start(noteLengthMs, advancePlayback);
}

const storageErrorMessages = {
  unavailable: "このブラウザーでは保存機能を使えません。",
  "future-version":
    "新しいバージョンで保存されたデータがあるため、保存できません。",
  "write-failed":
    "保存に失敗しました。ブラウザーの保存容量や設定を確認してください。",
  "limit-reached": `保存できる譜面は${MAX_SAVED_CHARTS}件までです。`,
  "not-found": "譜面が見つかりません。",
  "invalid-name": "譜面名を入力してください。",
  "invalid-chart": "この譜面は保存できません。",
};

function reportStorageError(result) {
  const message = storageErrorMessages[result.reason] ||
    "保存に失敗しました。";
  savedCharts.setSavedChartStatus(
    result.message ? `${message} ${result.message}` : message,
    true,
  );
}

function renderSavedChartList() {
  savedCharts.renderSavedCharts(repository.list(), {
    activeId: state.builderSavedChartId,
    renamingId: renamingChartId,
    available: repository.available,
  }, {
    onLoad: loadSavedChart,
    onStartRename: (id) => {
      renamingChartId = id;
      renderSavedChartList();
    },
    onRename: renameSavedChart,
    onCancelRename: () => {
      renamingChartId = null;
      renderSavedChartList();
    },
    onDelete: deleteSavedChart,
  });
}

/**
 * Stores the view, selected chart and (optionally) the builder draft so the
 * next visit can resume. Omitting `draft` keeps the previously stored one.
 * @param {{chart: object, savedChartId: string|null}|null} [draft]
 */
function persistSession(draft) {
  if (!repository.available) return;
  repository.saveSession({
    view: currentView,
    selectedChartId: state.selectedChartId,
    draft: draft === undefined ? repository.getSession()?.draft ?? null : draft,
  });
}

/**
 * Saves the builder chart as the session draft, and into its saved chart
 * when one is linked.
 */
function autosaveBuilder() {
  if (!repository.available) {
    actions.setBuilderPersistence({
      savedChartId: null,
      draftActive: true,
    });
    return;
  }
  const chart = createBuilderScoreDocument();
  let savedChartId = state.builderSavedChartId;
  if (savedChartId) {
    const result = repository.save({ id: savedChartId, chart });
    if (!result.ok) {
      if (result.reason === "not-found") savedChartId = null;
      reportStorageError(result);
    }
  }
  actions.setBuilderPersistence({ savedChartId, draftActive: true });
  persistSession({ chart, savedChartId });
}

/**
 * Persists a completed builder edit, then re-renders the builder.
 */
function afterBuilderEdit() {
  autosaveBuilder();
  renderBuilder();
  renderSavedChartList();
}

function saveCurrentChart() {
  const result = repository.save({ chart: createBuilderScoreDocument() });
  if (!result.ok) return reportStorageError(result);
  actions.setBuilderPersistence({
    savedChartId: result.entry.id,
    draftActive: true,
  });
  persistSession({ chart: result.entry.chart, savedChartId: result.entry.id });
  renderBuilder();
  renderSavedChartList();
  savedCharts.setSavedChartStatus(
    `「${result.entry.chart.name}」を保存しました。以降の編集は自動で保存されます。`,
    false,
  );
}

function loadSavedChart(id) {
  const entry = repository.get(id);
  if (!entry) {
    renderSavedChartList();
    return savedCharts.setSavedChartStatus(
      storageErrorMessages["not-found"],
      true,
    );
  }
  try {
    actions.loadBuilderChart(entry.chart);
  } catch (error) {
    return savedCharts.setSavedChartStatus(
      `読み込めません: ${error.message}`,
      true,
    );
  }
  renamingChartId = null;
  actions.setBuilderPersistence({ savedChartId: id, draftActive: true });
  persistSession({ chart: entry.chart, savedChartId: id });
  renderBuilder();
  renderSavedChartList();
  savedCharts.setSavedChartStatus(
    `「${entry.chart.name}」を読み込みました。`,
    false,
  );
}

function renameSavedChart(id, name) {
  const result = repository.rename(id, name);
  if (!result.ok) return reportStorageError(result);
  renamingChartId = null;
  if (id === state.builderSavedChartId) {
    actions.loadBuilderChart(result.entry.chart);
    afterBuilderEdit();
  } else {
    renderSavedChartList();
  }
  savedCharts.setSavedChartStatus(
    `譜面名を「${result.entry.chart.name}」に変更しました。`,
    false,
  );
}

function deleteSavedChart(id) {
  const entry = repository.get(id);
  if (!entry) return renderSavedChartList();
  if (!globalThis.confirm(`「${entry.chart.name}」を削除しますか？`)) return;
  const result = repository.remove(id);
  if (!result.ok) return reportStorageError(result);
  if (id === state.builderSavedChartId) {
    actions.setBuilderPersistence({
      savedChartId: null,
      draftActive: state.builderDraftActive,
    });
  }
  renamingChartId = null;
  renderBuilder();
  renderSavedChartList();
  savedCharts.setSavedChartStatus(
    `「${entry.chart.name}」を削除しました。`,
    false,
  );
}

/**
 * Switches away from the current page. A builder draft is kept; otherwise the
 * page state is reset to the selected chart as before.
 */
function prepareViewSwitch() {
  if (state.builderDraftActive) stopPlayback();
  else resetPageState();
}

function restoreLastSession() {
  const { status } = repository.load();
  if (status === "future" || status === "corrupt") {
    savedCharts.setSavedChartStatus(
      status === "future"
        ? "新しいバージョンで保存されたデータのため、保存機能は無効です。"
        : "保存データを読み込めませんでした。次回の保存時に新しいデータで置き換えます。",
      true,
    );
  }
  const session = repository.getSession();
  if (!session) return;

  const chartExists = chartCatalog.some((chart) =>
    chart.id === session.selectedChartId
  );
  if (chartExists && session.selectedChartId !== state.selectedChartId) {
    actions.selectChart(session.selectedChartId);
    resetPageState();
  }
  if (session.draft) {
    try {
      actions.loadBuilderChart(session.draft.chart);
      const linkedId = repository.get(session.draft.savedChartId)
        ? session.draft.savedChartId
        : null;
      actions.setBuilderPersistence({
        savedChartId: linkedId,
        draftActive: true,
      });
      renderBuilder();
    } catch {
      // An unreadable draft is ignored; the stored data is left untouched.
    }
  }
  currentView = session.view;
  if (currentView === "builder") showBuilderPage();
  else if (currentView === "guide") controls.renderGuideView();
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

function loadChartJson(parsed, { unlinkSavedChart = false } = {}) {
  const selectedChart = getSelectedChart();
  actions.loadBuilderChart(parsed, {
    name: selectedChart.name,
    difficulty: selectedChart.difficulty,
  });
  if (unlinkSavedChart) {
    actions.setBuilderPersistence({
      savedChartId: null,
      draftActive: true,
    });
  }
  afterBuilderEdit();
  editor.setJsonStatus("JSONを譜面に反映しました。", false);
}

function importChartJson(
  jsonText,
  errorPrefix = "JSONエラー",
  options = undefined,
) {
  try {
    loadChartJson(JSON.parse(jsonText), options);
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
    prepareViewSwitch();
    controls.renderGuideView();
    currentView = "guide";
    persistSession();
  },
  onShowBuilder: () => {
    prepareViewSwitch();
    showBuilderPage();
    currentView = "builder";
    persistSession();
  },
  onConnectMidi: connectMIDI,
  onToggleMidiRecording: toggleMidiRecording,
  onCompareMidi: compareMidiRecording,
});

transport.bindTransport({
  onPlay: (isBuilderPlayback) => {
    if (playbackController.isRunning) stopPlayback();
    else startPlayback(isBuilderPlayback);
  },
  onBpmChange: (value) => {
    actions.setBpm(value);
    updateTransportValues();
    if (playbackController.isRunning) startPlayback(state.isBuilderPlayback);
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
    afterBuilderEdit();
  },
  onRandomPattern: (options) => {
    actions.generateRandomPattern(options);
    actions.setBuilderPersistence({ savedChartId: null, draftActive: true });
    afterBuilderEdit();
    setBuilderMode("manual");
  },
  onManualFill: () => {
    actions.fillBuilderAlternating();
    afterBuilderEdit();
  },
  onImportJson: () => importChartJson(editorUi.getJsonText()),
  onExportJson: exportChartJson,
  onJsonEdit: markJsonEdited,
  onJsonFileText: (text) =>
    importChartJson(text, "JSONファイル読み込みエラー", {
      unlinkSavedChart: true,
    }),
  onJsonFileReadError: (error) =>
    editor.setJsonStatus(`JSONファイル読み込みエラー: ${error.message}`, true),
});

savedCharts.bindSavedCharts({ onSave: saveCurrentChart });
controls.renderInitialControls(state, getBuilderBarCount());
render();
restoreLastSession();
renderSavedChartList();
