export function createPlaybackController({
  timer,
  state,
  actions,
  getPlaybackChart,
  playbackRules,
  audio,
  view,
  challenge,
  now = () => Date.now(),
}) {
  let loopStartedAt = null;
  let loopNumber = 1;
  let loopEvents = [];
  let loopCurrentStep = 0;
  let loopState = null;
  let loopStoppedAt = null;

  function getPlaybackSnapshot() {
    return {
      events: loopEvents,
      startedAt: loopStartedAt,
      currentStep: loopCurrentStep,
      loopNumber,
      loopState,
      stoppedAt: loopStoppedAt,
    };
  }

  function setLoopState(value) {
    loopState = value;
  }

  function playCurrentStep(chart) {
    const scoreData = chart.scoreData;
    const scoreGrid = scoreData || chart.scoreGrid;
    const clickActions = playbackRules.getClickActions(
      scoreGrid,
      state.currentStep,
      state.clickIntervalSteps,
      state.clickEnabled,
    );
    const { activeEvent, eventIndex } = playbackRules.getPlaybackEvent(
      scoreData,
      state.currentStep,
    );
    if (playbackRules.shouldSilenceScratch(activeEvent)) {
      audio.silenceActiveScratch();
    }
    if (clickActions.shouldPlay) audio.playClickSound(clickActions.isDownbeat);

    const scratchActions = playbackRules.getScratchActions(
      scoreData,
      chart.steps,
      state.currentStep,
      state.bpm,
      eventIndex,
    );
    if (scratchActions) {
      audio.playScratch(
        scratchActions.soundType,
        scratchActions.startTick,
        scratchActions.strokeRunLength,
        scratchActions.options,
      );
    }
  }

  function advancePlayback() {
    const chart = getPlaybackChart();
    if (!chart.steps.length) return;

    const timestamp = now();
    const challengeLooping = challenge.isLooping();
    if (
      state.currentStep === 0 && loopState !== null &&
      loopState.startTime < timestamp
    ) {
      loopStartedAt = timestamp;
      loopNumber += 1;
      loopEvents = [];
      setLoopState(challenge.createLoopState(timestamp, loopNumber));
    }
    if (
      challengeLooping && challenge.hasSeenTick() && state.currentStep === 0
    ) {
      challenge.onLoopBoundary(timestamp);
      if (!timer.isRunning) return;
    }
    if (challengeLooping) challenge.markTickSeen();

    playCurrentStep(chart);
    view.renderPlaybackProgress();

    const cursor = playbackRules.updatePlaybackCursor(
      state.currentStep,
      chart.steps.length,
      challengeLooping || state.repeat,
    );
    loopCurrentStep = cursor.shouldStop
      ? state.currentStep
      : cursor.currentStep;
    if (cursor.shouldStop) return stop();
    actions.setPlaybackState({ currentStep: cursor.currentStep });
  }

  function start(isBuilderPlayback = false) {
    audio.initializeAudio();
    loopStartedAt = now();
    loopNumber = 1;
    loopEvents = [];
    loopCurrentStep = 0;
    setLoopState(challenge.createLoopState(loopStartedAt, loopNumber));
    loopStoppedAt = null;
    actions.setPlaybackState({ isBuilderPlayback });
    const chart = getPlaybackChart();
    if (!chart.steps.length) return;

    actions.setPlaybackState({ isPlaying: true });
    view.setPlaybackButton(true);

    const noteLengthMs = chart.scoreData
      ? chart.scoreData.tickDurationSeconds * (60000 / state.bpm)
      : chart.scoreGrid
      ? (60 / state.bpm) * chart.scoreGrid.beatsPerBar /
        chart.scoreGrid.ticksPerBar * 1000
      : (60000 / state.bpm) / 2;
    timer.start(noteLengthMs, advancePlayback);
  }

  function stop() {
    if (state.isPlaying) loopStoppedAt = now();
    const wasBuilderPlayback = state.isBuilderPlayback;
    timer.stop();
    audio.silenceActiveScratch();
    actions.setPlaybackState({ isPlaying: false, currentStep: 0 });
    view.setPlaybackButton(false);
    if (wasBuilderPlayback) {
      view.renderBuilderScore();
    } else {
      view.renderSelectedChart();
    }
    actions.setPlaybackState({ isBuilderPlayback: false });
  }

  function resetSnapshot() {
    loopStartedAt = null;
    loopEvents = [];
    loopCurrentStep = 0;
  }

  function clearRecordingSnapshot() {
    loopStartedAt = null;
    loopEvents = [];
  }

  function recordLoopEvent(event) {
    if (!timer.isRunning || state.isBuilderPlayback) return false;
    loopEvents = [...loopEvents, event];
    return true;
  }

  return {
    get isRunning() {
      return timer.isRunning;
    },
    get loopNumber() {
      return loopNumber;
    },
    start,
    stop,
    getPlaybackSnapshot,
    setLoopState,
    resetSnapshot,
    clearRecordingSnapshot,
    recordLoopEvent,
  };
}
