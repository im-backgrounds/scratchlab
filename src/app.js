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
import {
  assignMapping,
  clearMapping,
  createMidiMappingRepository,
  createStopDetector,
  FIXED_VELOCITY_ACTIONS,
  MIDI_ACTION_LABELS,
  MidiMappingConflictError,
  routeMidiMessage,
  swapFaderDirection,
} from "./domain/midi-mapping.js";
import {
  createPerformance,
  createPerformanceFilename,
  createPerformanceRepository,
  serializePerformance,
} from "./domain/performance.js";
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
import * as midiMappingUi from "./ui/midi-mapping.js";
import {
  analyzePerformance,
  createExpectedEvents,
} from "./domain/performance-analysis.js";
import {
  createChallengeRepository,
  createChartKey,
  deriveCurrentBpm,
  describeChallenge,
  getExpectedDurationMs,
} from "./domain/bpm-challenge.js";
import * as challengeUi from "./ui/challenge.js";
import * as performanceUi from "./ui/performance.js";
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
const midiMappingRepository = createMidiMappingRepository();
const MIDI_EVENT_LOG_LIMIT = 50;
let midiMapping = midiMappingRepository.load();
let midiLearnAction = null;
let midiEventLog = [];
const performanceRepository = createPerformanceRepository();
let latestPerformance = performanceRepository.load();
let performanceStartedAt = null;
const challengeRepository = createChallengeRepository();
// Only the challenged chart is kept; the BPM is derived from saved progress.
let activeChallengeKey = null;
let performanceBpm = null;

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
  abortPerformanceRecording();
  abortChallenge();
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
  renderPerformanceAnalysis();
  renderChallengePanel();
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
  challengeRepository.remove(`saved:${id}`);
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

function renderMidiMappingPanel() {
  midiMappingUi.renderMidiMapping(midiMapping, midiLearnAction, {
    onLearn: toggleMidiLearn,
    onClear: clearMidiMapping,
    onRangeChange: setFaderRange,
    onSwapFader: swapFader,
  });
}

function saveMidiMapping() {
  const result = midiMappingRepository.save(midiMapping);
  if (result.ok) return "";
  return result.reason === "future-version"
    ? "（新しい形式のデータがあるため、割り当てはこのブラウザーに保存されません）"
    : "（割り当てをブラウザーに保存できませんでした）";
}

function recordMidiActionEvent(event) {
  midiEventLog = [...midiEventLog, event].slice(-MIDI_EVENT_LOG_LIMIT);
  midiMappingUi.renderMidiEventLog(midiEventLog);
  if (state.recordingMidi) actions.recordMidiAction(event);
}

const stopDetector = createStopDetector({ onStop: recordMidiActionEvent });

function setFaderRange(action, values) {
  try {
    midiMapping = assignMapping(midiMapping, action, {
      ...midiMapping[action],
      ...values,
    });
  } catch (error) {
    midiMappingUi.renderMidiMappingStatus(
      error instanceof MidiMappingConflictError
        ? conflictMessage(error)
        : "開・閾値・閉は0〜127の整数で、開から閉へ向かう間に閾値が入るように指定してください（開と閉は同じ値にできません）。",
    );
    return;
  }
  const warning = saveMidiMapping();
  renderMidiMappingPanel();
  midiMappingUi.renderMidiMappingStatus(
    `${MIDI_ACTION_LABELS[action]} の設定を更新しました。${warning}`,
  );
}

function conflictMessage(error) {
  return `その入力は ${
    MIDI_ACTION_LABELS[error.conflictAction]
  } に割り当て済みのため、変更しませんでした。`;
}

function swapFader(action) {
  const current = midiMapping[action];
  if (!current) return;
  try {
    midiMapping = assignMapping(
      midiMapping,
      action,
      swapFaderDirection(current),
    );
  } catch (error) {
    midiMappingUi.renderMidiMappingStatus(
      error instanceof MidiMappingConflictError
        ? conflictMessage(error)
        : "開閉を入れ替えられませんでした。",
    );
    return;
  }
  const warning = saveMidiMapping();
  renderMidiMappingPanel();
  const { open, threshold, closed } = midiMapping[action];
  midiMappingUi.renderMidiMappingStatus(
    `開と閉を入れ替えました（開 ${open} 〜 閾値 ${threshold} 〜 閉 ${closed}）。${warning}`,
  );
}

function toggleMidiLearn(action) {
  stopDetector.cancel();
  midiLearnAction = midiLearnAction === action ? null : action;
  renderMidiMappingPanel();
  midiMappingUi.renderMidiMappingStatus(
    midiLearnAction
      ? state.midiConnected
        ? `${
          MIDI_ACTION_LABELS[action]
        }: 割り当てたいボタンやつまみを操作してください。`
        : `${
          MIDI_ACTION_LABELS[action]
        }: 「MIDI接続」を押してから操作してください。`
      : "Learnをキャンセルしました。",
  );
}

function clearMidiMapping(action) {
  midiMapping = clearMapping(midiMapping, action);
  const warning = saveMidiMapping();
  renderMidiMappingPanel();
  midiMappingUi.renderMidiMappingStatus(
    `${MIDI_ACTION_LABELS[action]} の割り当てを解除しました。${warning}`,
  );
}

function handleMidiMessage(data) {
  const [status, note, velocity] = data;
  const time = Date.now();
  const routed = routeMidiMessage(data, {
    mapping: midiMapping,
    learnAction: midiLearnAction,
    time,
  });

  if (routed.kind === "learned") {
    try {
      midiMapping = assignMapping(
        midiMapping,
        routed.action,
        routed.signature,
      );
    } catch (error) {
      if (!(error instanceof MidiMappingConflictError)) throw error;
      // Stay in Learn mode so the user can try another control.
      midiMappingUi.renderMidiMappingStatus(
        `この入力は ${
          MIDI_ACTION_LABELS[error.conflictAction]
        } に割り当て済みです。既存の割り当ては変更していません。別のボタンやつまみ、またはベロシティで操作してください。`,
      );
      return;
    }
    midiLearnAction = null;
    const warning = saveMidiMapping();
    renderMidiMappingPanel();
    const detail = FIXED_VELOCITY_ACTIONS.includes(routed.action)
      ? `（ベロシティ ${routed.signature.velocity}）`
      : "（開 0 〜 閾値 120 〜 閉 127 が初期値です。下の入力欄で調整できます）";
    midiMappingUi.renderMidiMappingStatus(
      `${
        MIDI_ACTION_LABELS[routed.action]
      } を割り当てました${detail}。${warning}`,
    );
    return;
  }
  if (midiLearnAction) return;

  const log = `status=${status}, note=${note}, velocity=${velocity}`;
  actions.recordMidiEvent({ status, note, velocity, time });

  if (routed.kind === "event") {
    recordMidiActionEvent(routed.event);
    stopDetector.observe(routed.event);
  }

  if (state.recordingMidi) {
    controls.renderMidiLog(`${log}\n記録中... ${state.midiRecord.length}件`);
  } else {
    controls.renderMidiLog(`MIDI入力: ${log}`);
  }
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
      input.onmidimessage = (event) => handleMidiMessage(event.data);
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

function analyzeForChart(performance, chart) {
  return analyzePerformance(
    createExpectedEvents(chart.scoreData),
    performance.events,
  );
}

function renderPerformanceAnalysis() {
  if (!latestPerformance) {
    performanceUi.renderPerformanceAnalysis(null, "");
    return;
  }
  const chart = getSelectedChart();
  performanceUi.renderPerformanceAnalysis(
    analyzeForChart(latestPerformance, chart),
    chart.name,
  );
}

// The practice view only offers built-in charts. Unsaved builder charts have
// no key, so describeChallenge reports them as not eligible.
function getChallengeChartKey() {
  return createChartKey({ type: "builtin", id: getSelectedChart().id });
}

function renderChallengePanel() {
  const chartKey = getChallengeChartKey();
  const active = chartKey !== null && activeChallengeKey === chartKey;
  const view = describeChallenge({
    chartKey,
    progress: chartKey ? challengeRepository.get(chartKey) : undefined,
    active,
  });
  challengeUi.renderChallenge(view, getSelectedChart().name);
  transport.setBpmLocked(active);
  return view;
}

function setChallengeStatus(message) {
  challengeUi.renderChallengeStatus(message);
}

function describeAttemptResult(outcome, bpm, accuracy) {
  if (!outcome.ok) {
    return outcome.reason === "unavailable"
      ? "このブラウザーでは進捗を保存できません。"
      : "進捗を保存できませんでした。";
  }
  const { result } = outcome;
  if (result.status === "ignored") {
    return result.reason === "no-accuracy"
      ? "記録されたイベントがなかったため、この挑戦は数えません。"
      : "この挑戦は数えません。";
  }
  const percent = `${accuracy.toFixed(1)}%`;
  if (!result.valid) {
    return `${bpm} BPM: 記録が長すぎます（譜面の長さの120%以内で演奏してください）。クリアになりません。`;
  }
  return result.cleared
    ? `${bpm} BPM クリア！ 一致率 ${percent}。次は ${
      deriveCurrentBpm(outcome.progress)
    } BPM です。`
    : `${bpm} BPM: 一致率 ${percent}。90%以上でクリアです。もう一度挑戦できます。`;
}

function evaluateChallengeAttempt(performance) {
  const chartKey = activeChallengeKey;
  activeChallengeKey = null;
  const chart = getSelectedChart();
  const bpm = performanceBpm;
  if (chartKey === null || chartKey !== getChallengeChartKey() || !bpm) {
    renderChallengePanel();
    return;
  }
  const analysis = analyzeForChart(performance, chart);
  const outcome = challengeRepository.recordAttempt(chartKey, {
    bpm,
    accuracy: analysis.accuracy,
    actualDurationMs: performance.durationMs,
    expectedDurationMs: getExpectedDurationMs(chart.scoreData, bpm),
  });
  setChallengeStatus(
    describeAttemptResult(outcome, bpm, analysis.accuracy ?? 0),
  );
  renderChallengePanel();
}

function startChallenge() {
  const view = renderChallengePanel();
  if (!view.canStart) return;
  if (state.recordingMidi) {
    setChallengeStatus("記録を停止してからチャレンジを開始してください。");
    return;
  }
  activeChallengeKey = getChallengeChartKey();
  actions.setBpm(view.currentBpm);
  updateTransportValues();
  if (playbackController.isRunning) startPlayback(state.isBuilderPlayback);
  renderChallengePanel();
  setChallengeStatus(
    `${view.currentBpm} BPM に固定しました。「記録を開始」で演奏を記録し、「記録を停止」で判定します。`,
  );
}

function resetChallengeProgress() {
  const chartKey = getChallengeChartKey();
  if (!chartKey || !challengeUi.confirmReset(getSelectedChart().name)) return;
  const result = challengeRepository.remove(chartKey);
  renderChallengePanel();
  setChallengeStatus(
    result.ok ? "進捗をリセットしました。" : "進捗をリセットできませんでした。",
  );
}

// Called when the page state is reset (chart switch): drop an unfinished
// challenge and release the BPM slider.
function abortChallenge() {
  const wasActive = activeChallengeKey !== null;
  activeChallengeKey = null;
  setChallengeStatus(
    wasActive ? "譜面の切り替えでチャレンジを中断しました。" : "",
  );
}

function finishPerformanceRecording() {
  const performance = createPerformance(state.midiActionRecord, {
    startedAt: performanceStartedAt,
    endedAt: Date.now(),
  });
  performanceStartedAt = null;
  const isChallengeTake = activeChallengeKey !== null;
  latestPerformance = performance;
  performanceUi.renderPerformance(performance);
  renderPerformanceAnalysis();
  const saved = performanceRepository.save(performance);
  const note = saved.ok
    ? "最新の記録はこのブラウザーに保存されました。"
    : "最新の記録をブラウザーに保存できませんでした。JSONで書き出してください。";
  const truncated = performance.truncated
    ? "イベント数が上限に達したため、後半は記録されていません。"
    : "";
  performanceUi.renderPerformanceStatus(
    `${performance.events.length}件のイベントを記録しました。${truncated}${note}`,
  );
  if (isChallengeTake) evaluateChallengeAttempt(performance);
}

// The page reset clears the MIDI recording state, so an unfinished
// performance is discarded and the panel is brought back in sync.
function abortPerformanceRecording() {
  if (!state.recordingMidi) return;
  stopDetector.cancel();
  performanceStartedAt = null;
  performanceBpm = null;
  performanceUi.renderPerformanceRecording(false);
  performanceUi.renderPerformanceStatus(
    "譜面の切り替えで記録を中断しました。",
  );
}

function toggleMidiRecording() {
  if (state.recordingMidi) {
    stopDetector.flush();
    finishPerformanceRecording();
  } else {
    stopDetector.cancel();
    performanceStartedAt = Date.now();
    performanceBpm = state.bpm;
    performanceUi.renderPerformanceStatus(
      "記録中… スクラッチとフェーダーの操作を記録しています。",
    );
  }
  actions.setMidiState({ recordingMidi: !state.recordingMidi });
  actions.clearMidiRecord();
  controls.renderMidiRecording(state.recordingMidi);
  performanceUi.renderPerformanceRecording(state.recordingMidi);
  controls.renderMidiLog(
    state.recordingMidi
      ? "MIDI記録を開始しました。DJコントローラの入力を4カウント後から記録します。"
      : "記録を停止しました。",
  );
}

function exportPerformance() {
  if (!latestPerformance) return;
  performanceUi.downloadPerformance(
    serializePerformance(latestPerformance),
    createPerformanceFilename(latestPerformance),
  );
  performanceUi.renderPerformanceStatus("記録をJSONで書き出しました。");
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

performanceUi.bindPerformance({
  onToggleRecording: toggleMidiRecording,
  onExport: exportPerformance,
});

transport.bindTransport({
  onPlay: (isBuilderPlayback) => {
    if (playbackController.isRunning) stopPlayback();
    else startPlayback(isBuilderPlayback);
  },
  onBpmChange: (value) => {
    if (activeChallengeKey !== null) {
      updateTransportValues();
      return;
    }
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

challengeUi.bindChallenge({
  onStart: startChallenge,
  onRetry: startChallenge,
  onReset: resetChallengeProgress,
});
savedCharts.bindSavedCharts({ onSave: saveCurrentChart });
controls.renderInitialControls(state, getBuilderBarCount());
render();
restoreLastSession();
renderMidiMappingPanel();
performanceUi.renderPerformance(latestPerformance);
renderPerformanceAnalysis();
if (latestPerformance) {
  performanceUi.renderPerformanceStatus("前回の記録を読み込みました。");
}
renderSavedChartList();
