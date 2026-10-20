import { chartCatalog as chartDefinitions } from "./data/chart-catalog.js";
import { compileScoreData } from "./domain/score-compiler.js";
import {
  createChartRepository,
  getBrowserStorage,
  MAX_SAVED_CHARTS,
} from "./domain/chart-storage.js";
import {
  assignMapping,
  clearMapping,
  createEventCompressor,
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
  CHALLENGE_EVENTS,
  CHALLENGE_PHASES,
  createChallengeSession,
  describeSessionProgress,
  describeSessionStatus,
  isSessionRunning,
  RECORDING_LOOPS,
  transitionSession,
} from "./domain/challenge-session.js";
import {
  createChallengeRepository,
  createChartKey,
  deriveCurrentBpm,
  describeChallenge,
  getExpectedDurationMs,
  isDurationValid,
} from "./domain/bpm-challenge.js";
import { bindKeyboardInput } from "./domain/keyboard-input.js";
import * as challengeUi from "./ui/challenge.js";
import * as beginnerCourseUi from "./ui/beginner-course.js";
import * as audioMonitoringUi from "./ui/audio-monitoring.js";
import * as performanceUi from "./ui/performance.js";
import * as achievementUi from "./ui/achievements.js";
import * as savedCharts from "./ui/saved-charts.js";
import * as visualizer from "./ui/visualizer.js";
import {
  BEGINNER_COURSE_STAGES,
  createBeginnerCourseRepository,
  getNextBeginnerStageId,
} from "./domain/beginner-course.js";
import {
  ACHIEVEMENTS,
  createAchievementRepository,
} from "./domain/achievement-system.js";
import { createPracticeView } from "./features/practice-view.js";
import { createBuilderView } from "./features/builder-view.js";
import { createBpmChallengeView } from "./features/bpm-challenge-view.js";
import { createBeginnerCourseView } from "./features/beginner-course-view.js";
import { renderAchievementView } from "./features/achievement-view.js";
import { createPerformanceView } from "./features/performance-view.js";
import { createInputEventLog } from "./features/input-event-log.js";

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

const FIRST_VISIT_GUIDANCE_KEY = "scratchlab.first-visit-guidance.v1";
const store = createStore(createInitialState(chartCatalog));
const actions = createActions(store);
const state = store.getState();
const repository = createChartRepository(getBrowserStorage());
const firstVisitGuidanceStorage = getBrowserStorage();
let currentView = "practice";
let renamingChartId = null;
const midiMappingRepository = createMidiMappingRepository();
const MIDI_EVENT_LOG_LIMIT = 50;
let midiMapping = midiMappingRepository.load();
let midiLearnAction = null;
const inputEventLog = createInputEventLog({
  limit: MIDI_EVENT_LOG_LIMIT,
  renderMidiEventLog: midiMappingUi.renderMidiEventLog,
});
let rawEventCount = 0;
let performanceEventCount = 0;
let recordedRawCount = 0;
const eventCompressor = createEventCompressor();
const performanceRepository = createPerformanceRepository();
let latestPerformance = performanceRepository.load();
let latestChallengeSummary = null;
let latestChallengeTimingAnalysis = null;
let latestChallengeTimingChartKey = null;
const challengeRepository = createChallengeRepository();
const achievementRepository = createAchievementRepository();
let achievementMessage = "";
const beginnerCourseRepository = createBeginnerCourseRepository();
const beginnerCourseLoad = beginnerCourseRepository.load();
// Only the challenged chart is kept; the BPM is derived from saved progress.
let activeChallengeKey = null;
let challengeSession = createChallengeSession();
let selectedCourseStageId = null;
let playbackLoopStartedAt = null;
let playbackLoopNumber = 1;
let playbackLoopEvents = [];
let playbackLoopCurrentStep = 0;
let beginnerCourseMessage = beginnerCourseLoad.ok
  ? getNextBeginnerStageId(beginnerCourseRepository.progress) === null
    ? "Beginnerコースをすべてクリアしました。"
    : ""
  : beginnerCourseLoad.reason === "future-version"
  ? "新しいバージョンのコース進捗があるため、保存を停止しています。"
  : beginnerCourseLoad.reason === "unavailable"
  ? "このブラウザーではコース進捗を保存できません。"
  : "コース進捗を読み込めませんでした。";
// {bpm, startedAt, loopEnds, tickSeen} of the attempt in progress.
let challengeRun = null;
const ANALYZE_DELAY_MS = 400;

const performanceView = createPerformanceView({
  getSelectedChart,
  getLatestPerformance: () => latestPerformance,
  performanceUi,
});
const builderView = createBuilderView({
  state,
  actions,
  editor,
  visualizer,
  getBuilderChart,
  getBuilderBarCount,
  updateTransportValues,
  compileScoreData,
  afterBuilderEdit,
});
const practiceView = createPracticeView({
  state,
  getSelectedChart,
  visualizer,
  performanceUi,
  getLatestPerformance: () => latestPerformance,
  analyzeForChart: performanceView.analyzeForChart,
  getPlaybackSnapshot: () => ({
    events: playbackLoopEvents,
    startedAt: playbackLoopStartedAt,
    currentStep: playbackLoopCurrentStep,
    loopNumber: playbackLoopNumber,
  }),
  renderBuilderScore: () => builderView.renderBuilderScore(),
});
const beginnerCourseView = createBeginnerCourseView({
  stages: BEGINNER_COURSE_STAGES,
  getSelectedStageId: () => selectedCourseStageId,
  repository: beginnerCourseRepository,
  getNextStageId: getNextBeginnerStageId,
  getSelectedChart,
  isSessionRunning: () => isSessionRunning(challengeSession),
  beginnerCourseUi,
  getMessage: () => beginnerCourseMessage,
});
const bpmChallengeView = createBpmChallengeView({
  getChallengeChartKey,
  getActiveChallengeKey: () => activeChallengeKey,
  getSelectedChart,
  challengeRepository,
  describeChallenge,
  challengeUi,
  describeSessionProgress,
  getChallengeSession: () => challengeSession,
  getBeginnerCourseStage: (stageId) => beginnerCourseView.getStage(stageId),
  getTimingAnalysis: (chartKey) =>
    chartKey === latestChallengeTimingChartKey
      ? latestChallengeTimingAnalysis
      : null,
  transport,
});

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

const {
  initializeAudio,
  playClickSound,
  playScratch,
  silenceActiveScratch,
  playInputScratch,
  setInputFaderState,
  silenceInput,
  setMonitorSettings,
} = createScratchAudio(state, getPlaybackChart, actions.setAudioResources);
const audioMonitorSettings = {
  sampleVolume: state.volume,
  youMuted: false,
  youVolume: 0.8,
  faderOpen: false,
  youPlaying: false,
};
let youActivityTimer = null;
let practiceModeEnabled = false;
const playbackController = createPlaybackController();

function renderSelectedChart() {
  practiceView.renderSelectedChart();
}

function renderControllerOverlay(chart) {
  practiceView.renderControllerOverlay(chart);
}

function showPracticeView() {
  controls.renderPracticeView();
}

function showBuilderPage() {
  controls.renderBuilderView();
}

function stopInputMonitoring() {
  keyboardInput.releaseAll();
  stopMouseScratch();
  audioMonitorSettings.faderOpen = false;
  setInputFaderState(false);
  silenceInput();
  renderAudioMonitoring();
}

function resetPageState() {
  stopInputMonitoring();
  stopPlayback();
  playbackLoopStartedAt = null;
  playbackLoopEvents = [];
  playbackLoopCurrentStep = 0;
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
  builderView.renderBuilder();
}

function renderBuilderScore() {
  builderView.renderBuilderScore();
}

function createBuilderScoreDocument() {
  return builderView.createBuilderScoreDocument();
}

function render() {
  visualizer.renderChartList(chartCatalog, state.selectedChartId, (chartId) => {
    selectedCourseStageId = null;
    beginnerCourseMessage = "";
    actions.selectChart(chartId);
    showPracticeView();
    resetPageState();
    currentView = "practice";
    syncPracticeModeButton();
    persistSession();
  });
  renderSelectedChart();
  renderBuilder();
  updateTransportValues();
  renderPerformanceAnalysis();
  renderChallengePanel();
  renderBeginnerCourse();
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
  practiceView.renderPlaybackProgress();
}

/**
 * Processes one playback tick, then renders and advances or ends the cursor.
 */
function advancePlayback() {
  const chart = getPlaybackChart();
  if (!chart.steps.length) return;

  const challengeLooping = isChallengeLooping();
  if (challengeLooping && challengeRun.tickSeen && state.currentStep === 0) {
    applyChallengeEvent(CHALLENGE_EVENTS.LOOP_END);
    if (!playbackController.isRunning) return;
  }
  if (challengeLooping) challengeRun.tickSeen = true;

  playCurrentStep(chart);
  renderPlaybackProgress();

  // A challenge always loops; it ends itself after the last recorded loop.
  const cursor = updatePlaybackCursor(
    state.currentStep,
    chart.steps.length,
    challengeLooping || state.repeat,
  );
  playbackLoopCurrentStep = cursor.shouldStop
    ? state.currentStep
    : cursor.currentStep;
  if (cursor.shouldStop) return stopPlayback();
  if (cursor.currentStep === 0) {
    playbackLoopStartedAt = Date.now();
    playbackLoopNumber += 1;
    playbackLoopEvents = [];
    playbackLoopCurrentStep = 0;
    eventCompressor.reset();
  } else if (
    cursor.currentStep % chart.scoreData?.ticksPerBar === 0
  ) {
    eventCompressor.reset();
  }
  actions.setPlaybackState({ currentStep: cursor.currentStep });
}

function stopPlayback() {
  const wasBuilderPlayback = state.isBuilderPlayback;
  playbackController.stop();
  silenceActiveScratch();
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
  playbackLoopStartedAt = Date.now();
  playbackLoopNumber = 1;
  playbackLoopEvents = [];
  playbackLoopCurrentStep = 0;
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

function initializeFirstVisitGuidance() {
  if (!firstVisitGuidanceStorage) {
    controls.renderFirstVisitGuidance(true, storageErrorMessages.unavailable);
    return;
  }
  try {
    const status = firstVisitGuidanceStorage.getItem(FIRST_VISIT_GUIDANCE_KEY);
    controls.renderFirstVisitGuidance(
      status !== "started" && status !== "skipped",
    );
  } catch (error) {
    controls.renderFirstVisitGuidance(
      true,
      `初回ガイドの状態を読み込めませんでした。${error.message}`,
    );
  }
}

function saveFirstVisitGuidance(status) {
  if (!firstVisitGuidanceStorage) return storageErrorMessages.unavailable;
  try {
    firstVisitGuidanceStorage.setItem(FIRST_VISIT_GUIDANCE_KEY, status);
    return "";
  } catch (error) {
    return `初回ガイドの状態を保存できませんでした。${error.message}`;
  }
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
  setPracticeModeEnabled(false);
  if (isSessionRunning(challengeSession)) {
    cancelChallenge("ページの切り替えでチャレンジを中断しました。");
  }
  if (state.builderDraftActive) {
    stopInputMonitoring();
    stopPlayback();
  } else resetPageState();
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
  syncPracticeModeButton();
  if (currentView === "builder") showBuilderPage();
  else if (currentView === "guide") controls.renderGuideView();
  else if (currentView === "midi") controls.renderMidiSetupView();
  else if (currentView === "achievements") {
    controls.renderAchievementsView();
    renderAchievementsPage();
  }
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

// Every converted message is logged as a raw event; only direction/state
// changes become performance events (logged, and recorded while recording).
function recordInputActionEvent(event) {
  rawEventCount += 1;
  if (state.recordingMidi) recordedRawCount += 1;
  inputEventLog.appendRawEvent(event);
  const performanceEvent = eventCompressor.accept(event);
  if (performanceEvent) {
    performanceEventCount += 1;
    inputEventLog.appendPerformanceEvent(performanceEvent);
    if (state.recordingMidi) actions.recordMidiAction(performanceEvent);
    if (playbackController.isRunning && !state.isBuilderPlayback) {
      playbackLoopEvents = [...playbackLoopEvents, performanceEvent];
      renderControllerOverlay(getSelectedChart());
    }
  }
  midiMappingUi.renderMidiEventCounts(rawEventCount, performanceEventCount);
}

function renderAudioMonitoring() {
  audioMonitoringUi.renderAudioMonitoring({
    ...audioMonitorSettings,
  });
}

function handleInputAudioEvent(event) {
  if (event.type === "fader") {
    audioMonitorSettings.faderOpen = currentView === "practice" &&
      event.state === "open";
    setInputFaderState(audioMonitorSettings.faderOpen);
    if (!audioMonitorSettings.faderOpen) {
      audioMonitorSettings.youPlaying = false;
      clearTimeout(youActivityTimer);
    }
    if (audioMonitorSettings.faderOpen) initializeAudio();
    renderAudioMonitoring();
  } else if (event.direction === "stop") {
    silenceInput();
    audioMonitorSettings.youPlaying = false;
    clearTimeout(youActivityTimer);
    renderAudioMonitoring();
  } else if (
    currentView === "practice" && audioMonitorSettings.faderOpen &&
    !audioMonitorSettings.youMuted
  ) {
    initializeAudio();
    playInputScratch(event.direction);
    audioMonitorSettings.youPlaying = true;
    clearTimeout(youActivityTimer);
    youActivityTimer = setTimeout(() => {
      audioMonitorSettings.youPlaying = false;
      renderAudioMonitoring();
    }, 180);
    renderAudioMonitoring();
  }
  recordInputActionEvent(event);
}

const stopDetector = createStopDetector({ onStop: handleInputAudioEvent });

const keyboardInput = bindKeyboardInput({
  enabled: () => practiceModeEnabled && currentView === "practice",
  onEvent: (event) => {
    handleInputAudioEvent(event);
  },
  onEscape: () => setPracticeModeEnabled(false),
  onFaderStateChange: (state, heldKeys) => {
    document.getElementById("keyboard-fader-state").textContent =
      state === "open" ? "開" : "閉";
    for (const key of ["KeyW", "KeyP", "KeyS", "KeyL"]) {
      document.querySelector(`[data-fader-key="${key}"]`).classList.toggle(
        "is-active",
        heldKeys.includes(key),
      );
    }
    audioMonitorSettings.faderOpen = state === "open";
    setInputFaderState(audioMonitorSettings.faderOpen);
    if (audioMonitorSettings.faderOpen && practiceModeEnabled) {
      initializeAudio();
    }
    renderAudioMonitoring();
  },
});

let activeMouseDirection = null;
let lastMouseDirection = null;
let lastMouseInputAt = 0;
let mouseStopTimer = null;

function stopMouseScratch() {
  clearTimeout(mouseStopTimer);
  mouseStopTimer = null;
  if (!activeMouseDirection) return;
  activeMouseDirection = null;
  lastMouseDirection = null;
  handleInputAudioEvent({
    type: "scratch",
    direction: "stop",
    time: Date.now(),
  });
}

function syncPracticeModeButton() {
  const button = document.getElementById("practice-mode-toggle");
  button.hidden = currentView !== "practice";
  button.setAttribute("aria-pressed", String(practiceModeEnabled));
  button.textContent = practiceModeEnabled
    ? "練習モード解除（Esc）"
    : "練習モードを有効化";
}

function setPracticeModeEnabled(enabled) {
  if (enabled && currentView !== "practice") return;
  if (practiceModeEnabled === enabled) return;
  if (!enabled) {
    keyboardInput.releaseAll();
    stopMouseScratch();
  }
  practiceModeEnabled = enabled;
  document.body.classList.toggle("practice-mode-active", enabled);
  if (enabled) keyboardInput.setFaderState("open");
  syncPracticeModeButton();
}

document.getElementById("practice-mode-toggle").addEventListener(
  "click",
  () => setPracticeModeEnabled(!practiceModeEnabled),
);

const isPracticeModeToggle = (target) =>
  target instanceof Element && target.closest("#practice-mode-toggle");

document.addEventListener("pointermove", (event) => {
  if (
    !practiceModeEnabled || event.pointerType !== "mouse" ||
    isPracticeModeToggle(event.target) || event.movementY === 0
  ) return;

  const direction = event.movementY < 0 ? "forward" : "backward";
  const now = Date.now();
  if (direction !== lastMouseDirection || now - lastMouseInputAt >= 120) {
    activeMouseDirection = direction;
    lastMouseDirection = direction;
    lastMouseInputAt = now;
    stopDetector.cancel();
    handleInputAudioEvent({ type: "scratch", direction, time: now });
  }
  clearTimeout(mouseStopTimer);
  mouseStopTimer = setTimeout(stopMouseScratch, 180);
});
document.defaultView?.addEventListener("blur", stopMouseScratch);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    stopMouseScratch();
    setPracticeModeEnabled(false);
  }
});

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

  if (routed.kind === "event") {
    if (routed.event.type === "fader") {
      keyboardInput.setFaderState(
        currentView === "practice" ? routed.event.state : "closed",
      );
    } else if (activeMouseDirection !== null) {
      stopDetector.cancel();
    }
    handleInputAudioEvent(routed.event);
    if (
      routed.event.type === "scratch" &&
      activeMouseDirection === null
    ) stopDetector.observe(routed.event);
  }

  controls.renderMidiLog(
    `MIDI入力: status=${status}, note=${note}, velocity=${velocity}`,
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
  return performanceView.analyzeForChart(performance, chart);
}

function renderPerformanceAnalysis() {
  performanceView.renderPerformanceAnalysis();
}

// The practice view only offers built-in charts. Unsaved builder charts have
// no key, so describeChallenge reports them as not eligible.
function getChallengeChartKey() {
  return createChartKey({ type: "builtin", id: getSelectedChart().id });
}

function getBeginnerCourseStage(stageId = selectedCourseStageId) {
  return beginnerCourseView.getStage(stageId);
}

function renderBeginnerCourse() {
  beginnerCourseView.renderBeginnerCourse();
}

function renderAchievementsPage() {
  renderAchievementView({
    repository: achievementRepository,
    getMessage: () => achievementMessage,
    achievementUi,
    charts: chartCatalog,
  });
}

function renderChallengePanel() {
  return bpmChallengeView.renderChallengePanel();
}

function selectBeginnerCourseStage(stageId) {
  const stage = getBeginnerCourseStage(stageId);
  const nextStageId = getNextBeginnerStageId(
    beginnerCourseRepository.progress,
  );
  if (
    !stage ||
    (!beginnerCourseRepository.progress.completedStageIds.includes(stage.id) &&
      stage.id !== nextStageId)
  ) return;

  selectedCourseStageId = stage.id;
  beginnerCourseMessage =
    `${stage.name}を選択しました。90%以上の一致率でクリアできます。`;
  actions.selectChart(stage.chartId);
  showPracticeView();
  resetPageState();
  if (stage.targetBpm !== null) {
    actions.setBpm(stage.targetBpm);
    updateTransportValues();
  }
  currentView = "practice";
  syncPracticeModeButton();
  persistSession();
  renderBeginnerCourse();
}

function setChallengeStatus(message) {
  bpmChallengeView.setStatus(message);
}

function createChallengeSessionId() {
  return globalThis.crypto?.randomUUID?.() ??
    `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
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

function recordPracticeAchievement(run, accuracy, cleared) {
  const result = achievementRepository.recordSession({
    id: run.sessionId,
    pattern: getSelectedChart().id,
    bpm: run.bpm,
    accuracy,
    cleared,
  });
  if (!result.ok) {
    const message = result.reason === "future-version"
      ? "新しいバージョンの実績データがあるため、実績を保存できません。"
      : "実績を保存できませんでした。ブラウザーの保存設定を確認してください。";
    achievementMessage = message;
    return message;
  }
  achievementMessage = "";
  if (result.newlyEarned.length > 0) {
    const titles = ACHIEVEMENTS.filter((achievement) =>
      result.newlyEarned.includes(achievement.id)
    ).map((achievement) => achievement.title);
    achievementUi.renderAchievementNotification(titles);
  }
  return "";
}

function isChallengeLooping() {
  return challengeRun !== null && !state.isBuilderPlayback &&
    (challengeSession.phase === CHALLENGE_PHASES.DEMO ||
      challengeSession.phase === CHALLENGE_PHASES.RECORDING);
}

function evaluateChallengeAttempt(performance, run) {
  const chartKey = activeChallengeKey;
  activeChallengeKey = null;
  const chart = getSelectedChart();
  if (chartKey === null || chartKey !== getChallengeChartKey()) {
    renderChallengePanel();
    return;
  }
  const analysis = analyzeForChart(performance, chart);
  if (run.courseStageId) {
    const stage = getBeginnerCourseStage(run.courseStageId);
    if (!stage) {
      beginnerCourseMessage = "コースの課題を特定できませんでした。";
      renderBeginnerCourse();
      return;
    }
    const expectedDurationMs = getExpectedDurationMs(chart.scoreData, run.bpm) *
      RECORDING_LOOPS;
    const validPractice = analysis.accuracy !== null &&
      isDurationValid(performance.durationMs, expectedDurationMs);
    const achievementError = validPractice
      ? recordPracticeAchievement(run, analysis.accuracy, false)
      : "";
    if (analysis.accuracy === null) {
      beginnerCourseMessage =
        "分析できるイベントがなかったため、この課題はクリアになりません。";
    } else if (
      !isDurationValid(performance.durationMs, expectedDurationMs)
    ) {
      beginnerCourseMessage =
        "記録時間が譜面の長さに合わなかったため、クリアになりません。";
    } else if (analysis.accuracy < 90) {
      beginnerCourseMessage = `一致率 ${
        analysis.accuracy.toFixed(1)
      }%。90%以上でクリアです。もう一度練習できます。`;
    } else {
      const result = beginnerCourseRepository.complete(stage.id);
      if (!result.ok) {
        beginnerCourseMessage = result.reason === "future-version"
          ? "新しいバージョンのコース進捗があるため、完了を保存できません。"
          : "コースの完了を保存できませんでした。ブラウザーの保存設定を確認してください。";
      } else {
        const nextStageId = getNextBeginnerStageId(result.progress);
        const nextStage = BEGINNER_COURSE_STAGES.find((item) =>
          item.id === nextStageId
        );
        beginnerCourseMessage = nextStage
          ? `${stage.name}をクリアしました。一致率 ${
            analysis.accuracy.toFixed(1)
          }%。次は${nextStage.name}です。`
          : `Beginnerコースをすべてクリアしました。一致率 ${
            analysis.accuracy.toFixed(1)
          }%。`;
      }
    }
    if (achievementError) {
      beginnerCourseMessage += ` ${achievementError}`;
    }
    renderBeginnerCourse();
    return;
  }
  latestChallengeSummary = analysis.accuracy === null
    ? null
    : {
      pattern: chart.name,
      bpm: run.bpm,
      accuracy: analysis.accuracy,
    };
  latestChallengeTimingAnalysis = performanceView.analyzeTimingForChart(
    performance,
    chart,
    run.bpm,
  );
  latestChallengeTimingChartKey = chartKey;
  performanceUi.renderPerformanceSummaryAvailability(
    latestChallengeSummary !== null,
  );
  const outcome = challengeRepository.recordAttempt(chartKey, {
    bpm: run.bpm,
    accuracy: analysis.accuracy,
    actualDurationMs: performance.durationMs,
    expectedDurationMs: getExpectedDurationMs(chart.scoreData, run.bpm) *
      RECORDING_LOOPS,
  });
  const resultMessage = describeAttemptResult(
    outcome,
    run.bpm,
    analysis.accuracy ?? 0,
  );
  setChallengeStatus(resultMessage);
  if (
    outcome.ok && outcome.result.status === "counted" &&
    outcome.result.valid
  ) {
    const achievementError = recordPracticeAchievement(
      run,
      analysis.accuracy,
      outcome.result.cleared,
    );
    if (achievementError) {
      setChallengeStatus(`${resultMessage} ${achievementError}`);
    }
  }
}

/**
 * Feeds one event to the challenge state machine and performs the side
 * effect of the transition it caused.
 */
function applyChallengeEvent(event, now = Date.now()) {
  const { session, effect } = transitionSession(challengeSession, event);
  challengeSession = session;
  const message = describeSessionStatus(session, challengeRun?.bpm);
  if (message) setChallengeStatus(message);
  if (effect === "start-playback") {
    stopPlayback();
    startPlayback(false);
  } else if (effect === "start-recording") {
    beginChallengeRecording(now);
  } else if (effect === "next-recording") {
    stopDetector.flush(now);
    challengeRun.loopEnds.push(now - challengeRun.startedAt);
  } else if (effect === "finish-recording") {
    const run = challengeRun;
    const performance = finishChallengeRecording(run, now);
    stopPlayback();
    setTimeout(() => completeChallenge(performance, run), ANALYZE_DELAY_MS);
  }
  renderChallengePanel();
  renderBeginnerCourse();
}

function completeChallenge(performance, run) {
  if (challengeSession.phase !== CHALLENGE_PHASES.ANALYZING) return;
  evaluateChallengeAttempt(performance, run);
  challengeRun = null;
  applyChallengeEvent(CHALLENGE_EVENTS.ANALYZED);
}

function startChallenge() {
  const view = renderChallengePanel();
  if (!view.canStart || isSessionRunning(challengeSession)) return;
  if (!hasChallengeInputs()) return;
  if (midiLearnAction) {
    midiLearnAction = null;
    renderMidiMappingPanel();
  }
  activeChallengeKey = getChallengeChartKey();
  latestChallengeTimingAnalysis = null;
  latestChallengeTimingChartKey = null;
  challengeRun = {
    sessionId: createChallengeSessionId(),
    courseStageId: null,
    bpm: view.currentBpm,
    startedAt: null,
    loopEnds: [],
    tickSeen: false,
  };
  actions.setBpm(view.currentBpm);
  updateTransportValues();
  applyChallengeEvent(CHALLENGE_EVENTS.START);
}

function hasChallengeInputs(report = setChallengeStatus) {
  const midiScratchAvailable = state.midiConnected &&
    midiMapping.forward && midiMapping.backward;
  const mouseScratchAvailable = practiceModeEnabled;
  const midiFaderAvailable = state.midiConnected && midiMapping.fader;
  const keyboardFaderAvailable = practiceModeEnabled;
  const scratchAvailable = midiScratchAvailable || mouseScratchAvailable;
  const faderAvailable = midiFaderAvailable || keyboardFaderAvailable;
  if (scratchAvailable && faderAvailable) return true;

  const reasons = [];
  if (!scratchAvailable) {
    reasons.push(
      "スクラッチ入力が設定されていません。Mouse操作またはMIDI設定でForward/Backwardを割り当ててください。",
    );
  }
  if (!faderAvailable) {
    reasons.push(
      "フェーダー入力が設定されていません。練習モードのKeyboard操作またはMIDI設定でFaderを割り当ててください。",
    );
  }
  report(reasons.join(" "));
  return false;
}

function startBeginnerCourseAttempt() {
  const stage = getBeginnerCourseStage();
  const nextStageId = getNextBeginnerStageId(
    beginnerCourseRepository.progress,
  );
  if (
    !stage ||
    getSelectedChart().id !== stage.chartId ||
    (!beginnerCourseRepository.progress.completedStageIds.includes(stage.id) &&
      stage.id !== nextStageId)
  ) {
    beginnerCourseMessage = "先に次の課題を選択してください。";
    return renderBeginnerCourse();
  }
  if (isSessionRunning(challengeSession)) return;
  if (
    !hasChallengeInputs((message) => {
      beginnerCourseMessage = message;
      renderBeginnerCourse();
    })
  ) return;
  if (midiLearnAction) {
    midiLearnAction = null;
    renderMidiMappingPanel();
  }
  const bpm = stage.targetBpm ?? state.bpm;
  activeChallengeKey = getChallengeChartKey();
  challengeRun = {
    sessionId: createChallengeSessionId(),
    courseStageId: stage.id,
    bpm,
    startedAt: null,
    loopEnds: [],
    tickSeen: false,
  };
  actions.setBpm(bpm);
  updateTransportValues();
  beginnerCourseMessage = `${stage.name}に挑戦中です。`;
  renderBeginnerCourse();
  applyChallengeEvent(CHALLENGE_EVENTS.START);
}

function resetChallengeProgress() {
  const chartKey = getChallengeChartKey();
  if (!chartKey || !challengeUi.confirmReset(getSelectedChart().name)) return;
  const result = challengeRepository.remove(chartKey);
  if (result.ok) {
    latestChallengeTimingAnalysis = null;
    latestChallengeTimingChartKey = null;
  }
  renderChallengePanel();
  setChallengeStatus(
    result.ok ? "進捗をリセットしました。" : "進捗をリセットできませんでした。",
  );
}

// Drops an unfinished challenge and releases the BPM slider. Called when the
// page state is reset (chart switch) or the user leaves the practice view.
function abortChallenge(reason = "譜面の切り替えでチャレンジを中断しました。") {
  const wasRunning = isSessionRunning(challengeSession);
  activeChallengeKey = null;
  challengeRun = null;
  challengeSession = transitionSession(
    challengeSession,
    CHALLENGE_EVENTS.ABORT,
  ).session;
  setChallengeStatus(wasRunning ? reason : "");
}

function cancelChallenge(reason) {
  stopPlayback();
  abortPerformanceRecording();
  abortChallenge(reason);
  renderChallengePanel();
  renderBeginnerCourse();
}

function beginChallengeRecording(now) {
  stopDetector.cancel();
  eventCompressor.reset();
  recordedRawCount = 0;
  actions.clearMidiRecord();
  actions.setMidiState({ recordingMidi: true });
  challengeRun.startedAt = now;
  challengeRun.loopEnds = [];
  performanceUi.renderPerformanceRecording(true);
  performanceUi.renderPerformanceStatus(
    "記録中… お手本のあとの2ループを自動で記録します。",
  );
}

function finishChallengeRecording(run, now) {
  stopDetector.flush(now);
  const performance = createPerformance(state.midiActionRecord, {
    startedAt: run.startedAt,
    endedAt: now,
    loopEnds: run.loopEnds,
  });
  actions.setMidiState({ recordingMidi: false });
  actions.clearMidiRecord();
  latestPerformance = performance;
  performanceUi.renderPerformanceRecording(false);
  performanceUi.renderPerformance(performance);
  renderPerformanceAnalysis();
  renderSelectedChart();
  const saved = performanceRepository.save(performance);
  const note = saved.ok
    ? "最新の記録はこのブラウザーに保存されました。"
    : "最新の記録をブラウザーに保存できませんでした。JSONで書き出してください。";
  const truncated = performance.truncated
    ? "イベント数が上限に達したため、後半は記録されていません。"
    : "";
  performanceUi.renderPerformanceStatus(
    `${performance.events.length}件のイベントを記録しました（受信${recordedRawCount}件を方向の変化だけに圧縮）。${truncated}${note}`,
  );
  return performance;
}

// The page reset clears the MIDI recording state, so an unfinished
// performance is discarded and the panel is brought back in sync.
function abortPerformanceRecording() {
  if (!state.recordingMidi) return;
  stopDetector.cancel();
  actions.setMidiState({ recordingMidi: false });
  actions.clearMidiRecord();
  performanceUi.renderPerformanceRecording(false);
  performanceUi.renderPerformanceStatus("記録を中断しました。");
}

function exportPerformance() {
  if (!latestPerformance) return;
  performanceUi.downloadPerformance(
    serializePerformance(latestPerformance),
    createPerformanceFilename(latestPerformance),
  );
  performanceUi.renderPerformanceStatus("記録をJSONで書き出しました。");
}

async function exportPerformanceSummary() {
  if (!latestChallengeSummary) return;
  try {
    await performanceUi.downloadPerformanceSummary(latestChallengeSummary);
    performanceUi.renderPerformanceStatus("成績画像をPNGで書き出しました。");
  } catch (error) {
    performanceUi.renderPerformanceStatus(
      `成績画像を書き出せませんでした: ${error.message}`,
    );
  }
}

controls.bindControls({
  onShowGuide: () => {
    prepareViewSwitch();
    controls.renderGuideView();
    currentView = "guide";
    syncPracticeModeButton();
    persistSession();
  },
  onStartFirstVisitGuide: () => {
    const message = saveFirstVisitGuidance("started");
    controls.renderFirstVisitGuidance(false, message);
    prepareViewSwitch();
    controls.renderGuideView();
    currentView = "guide";
    syncPracticeModeButton();
    persistSession();
  },
  onSkipFirstVisitGuide: () => {
    const message = saveFirstVisitGuidance("skipped");
    controls.renderFirstVisitGuidance(false, message);
  },
  onShowBuilder: () => {
    prepareViewSwitch();
    showBuilderPage();
    currentView = "builder";
    syncPracticeModeButton();
    persistSession();
  },
  onShowMidiSetup: () => {
    prepareViewSwitch();
    controls.renderMidiSetupView();
    currentView = "midi";
    syncPracticeModeButton();
    persistSession();
  },
  onShowAchievements: () => {
    prepareViewSwitch();
    controls.renderAchievementsView();
    renderAchievementsPage();
    currentView = "achievements";
    syncPracticeModeButton();
    persistSession();
  },
  onConnectMidi: connectMIDI,
});

achievementUi.bindAchievements({
  onDismiss: achievementUi.dismissAchievementNotification,
  onClearHistory: () => {
    const result = achievementRepository.clear();
    achievementMessage = result.ok
      ? "練習履歴と実績を削除しました。"
      : result.reason === "future-version"
      ? "新しいバージョンのデータがあるため、削除できません。"
      : "練習履歴を削除できませんでした。ブラウザーの保存設定を確認してください。";
    if (result.ok) achievementUi.dismissAchievementNotification();
    renderAchievementsPage();
  },
});

performanceUi.bindPerformance({
  onExport: exportPerformance,
  onExportSummary: exportPerformanceSummary,
});

audioMonitoringUi.bindAudioMonitoring({
  onYouMute: (youMuted) => {
    audioMonitorSettings.youMuted = youMuted;
    setMonitorSettings({ youMuted });
    if (youMuted) {
      audioMonitorSettings.youPlaying = false;
      clearTimeout(youActivityTimer);
    }
    renderAudioMonitoring();
  },
  onYouVolume: (youVolume) => {
    audioMonitorSettings.youVolume = youVolume;
    setMonitorSettings({ youVolume });
    renderAudioMonitoring();
  },
});

transport.bindTransport({
  onPlay: (isBuilderPlayback) => {
    if (!playbackController.isRunning) startPlayback(isBuilderPlayback);
    else if (isSessionRunning(challengeSession)) {
      cancelChallenge("再生の停止でチャレンジを中断しました。");
    } else stopPlayback();
  },
  onBpmChange: (value) => {
    if (activeChallengeKey !== null) {
      updateTransportValues();
      return;
    }
    actions.setBpm(value);
    updateTransportValues();
    renderChallengePanel();
    renderBeginnerCourse();
    if (playbackController.isRunning) startPlayback(state.isBuilderPlayback);
  },
  onVolumeChange: (value) => {
    actions.setVolume(value);
    audioMonitorSettings.sampleVolume = value;
    setMonitorSettings({ sampleVolume: value });
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

const editorUi = editor.bindEditor({
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
  onReset: resetChallengeProgress,
});
beginnerCourseUi.bindBeginnerCourse({
  onSelectStage: selectBeginnerCourseStage,
  onStart: startBeginnerCourseAttempt,
});
savedCharts.bindSavedCharts({ onSave: saveCurrentChart });
controls.renderInitialControls(state, getBuilderBarCount());
syncPracticeModeButton();
renderAudioMonitoring();
render();
initializeFirstVisitGuidance();
restoreLastSession();
renderMidiMappingPanel();
performanceUi.renderPerformance(latestPerformance);
renderPerformanceAnalysis();
if (latestPerformance) {
  performanceUi.renderPerformanceStatus("前回の記録を読み込みました。");
}
renderSavedChartList();
