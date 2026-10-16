import { chartCatalog as chartDefinitions } from "./data/chart-catalog.js";
import { compileScoreData, deriveBuilderDirections } from "./domain/score-compiler.js";
import { createScratchAudio } from "./audio/scratch-audio.js";
import { buildScratchVisualizer as buildScratchSvg } from "./ui/scratch-visualizer.js";

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

const state = {
  selectedChartId: "baby-scratch",
  bpm: 110,
  volume: 0.8,
  repeat: true,
  clickEnabled: true,
  clickIntervalSteps: 2,
  clickVolume: 0.5,
  isPlaying: false,
  currentStep: 0,
  timer: null,
  audioContext: null,
  scratchBuffers: null,
  builderSteps: [...chartCatalog[0].steps],
  builderScoreMode: chartCatalog[0].scoreMode || null,
  builderScoreData: null,
  builderMetadata: { name: chartCatalog[0].name, difficulty: chartCatalog[0].difficulty },
  builderJsonDirty: false,
  builderActiveMode: "random",
  builderBeat: "4/4",
  builderTicksPerBar: 8,
  builderDirections: chartCatalog[0].steps.map((step) => (step === "R" ? "B" : "F")),
  builderSelectedType: "L",
  isBuilderPlayback: false,
  midiStatus: "MIDI未接続",
  midiAccess: null,
  midiConnected: false,
  midiRecord: [],
  recordingMidi: false,
};

const chartListEl = document.getElementById("chart-list");
const sidebar = document.getElementById("sidebar");
const mobileMenuToggle = document.getElementById("mobile-menu-toggle");
const mainPanel = document.querySelector(".main-panel");
const chartTitleEl = document.getElementById("chart-title");
const chartDescriptionEl = document.getElementById("chart-description");
const chartDifficultyEl = document.getElementById("chart-difficulty");
const chartStepsEl = document.getElementById("chart-steps");
const chartHelpToggle = document.getElementById("chart-help-toggle");
const chartHelpPanel = document.getElementById("chart-help-panel");
const chartHelpTitle = document.getElementById("chart-help-title");
const chartHelpText = document.getElementById("chart-help-text");
const practiceView = document.getElementById("practice-view");
const notationGuidePage = document.getElementById("notation-guide-page");
const builderPage = document.getElementById("builder-page");
const notationGuideTab = document.getElementById("notation-guide-tab");
const builderScoreEl = document.getElementById("builder-score");
const practiceTransportSlot = document.getElementById("practice-transport-slot");
const builderTransportSlot = document.getElementById("builder-transport-slot");
const transportPanel = document.getElementById("transport-panel");
const bpmSlider = document.getElementById("bpm-slider");
const bpmValueEl = document.getElementById("bpm-value");
const volumeSlider = document.getElementById("volume-slider");
const volumeValueEl = document.getElementById("volume-value");
const repeatToggle = document.getElementById("repeat-toggle");
const clickToggle = document.getElementById("click-toggle");
const clickDivisionInputs = document.querySelectorAll('input[name="click-division"]');
const clickVolumeSlider = document.getElementById("click-volume-slider");
const clickVolumeValueEl = document.getElementById("click-volume-value");
const playToggle = document.getElementById("play-toggle");
const builderTab = document.getElementById("builder-tab");
const patternLengthInput = document.getElementById("pattern-length");
const patternLengthValue = document.getElementById("pattern-length-value");
const builderStepsEl = document.getElementById("builder-steps");
const chartJsonEl = document.getElementById("chart-json");
const builderChartInfoEl = document.getElementById("builder-chart-info");
const builderManualInfoEl = document.getElementById("builder-manual-info");
const builderToolHintEl = document.getElementById("builder-tool-hint");
const jsonStatusEl = document.getElementById("json-status");
const chartJsonFileInput = document.getElementById("chart-json-file");
const builderModeTabs = [...document.querySelectorAll(".builder-mode-tab")];
const builderModePanels = [...document.querySelectorAll(".builder-mode-panel")];
const midiStatusEl = document.getElementById("midi-status");
const midiLogEl = document.getElementById("midi-log");
const midiConnectButton = document.getElementById("midi-connect");
const recordMidiButton = document.getElementById("record-midi");
const compareMidiButton = document.getElementById("compare-midi");

function setMobileMenuOpen(isOpen, restoreFocus = false) {
  document.body.classList.toggle("mobile-menu-open", isOpen);
  mobileMenuToggle.setAttribute("aria-expanded", String(isOpen));
  mobileMenuToggle.setAttribute("aria-label", isOpen ? "メニューを閉じる" : "メニューを開く");
  mainPanel.inert = isOpen;
  if (!isOpen && restoreFocus) {
    mobileMenuToggle.focus({ preventScroll: true });
  }
}

mobileMenuToggle.addEventListener("click", () => {
  setMobileMenuOpen(!document.body.classList.contains("mobile-menu-open"));
});

sidebar.addEventListener("click", (event) => {
  if (event.target.closest("button")) {
    setMobileMenuOpen(false, true);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.body.classList.contains("mobile-menu-open")) {
    setMobileMenuOpen(false, true);
  }
});

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

const { initializeAudio, playClickSound, playScratch, silenceActiveScratch } = createScratchAudio(state, getPlaybackChart);

function renderChartList() {
  chartListEl.innerHTML = "";

  chartCatalog.forEach((chart) => {
    const item = document.createElement("li");
    item.innerHTML = `
      <button class="chart-item ${chart.id === state.selectedChartId ? "active" : ""}" data-chart-id="${chart.id}">
        <div class="chart-item-header">
          <span class="chart-item-name">${chart.name}</span>
          <span class="chart-item-level difficulty-${chart.difficulty.toLowerCase()}">${chart.difficulty}</span>
        </div>
        <p class="chart-item-desc">${chart.description}</p>
      </button>
    `;

    item.querySelector(".chart-item").addEventListener("click", () => {
      state.selectedChartId = chart.id;
      showPracticeView();
      resetPageState();
    });

    chartListEl.appendChild(item);
  });
}

function renderSelectedChart() {
  const chart = getSelectedChart();
  chartTitleEl.textContent = chart.name;
  chartDescriptionEl.textContent = chart.description;
  chartDifficultyEl.textContent = chart.difficulty;
  chartDifficultyEl.className = `status-pill difficulty-${chart.difficulty.toLowerCase()}`;
  chartHelpTitle.textContent = `${chart.name}の見方`;
  chartHelpText.textContent = chart.guide;

  chartStepsEl.innerHTML = buildScratchSvg(chart.steps, chart, state);
}

function showPracticeView() {
  practiceTransportSlot.append(transportPanel);
  practiceView.hidden = false;
  notationGuidePage.hidden = true;
  builderPage.hidden = true;
  notationGuideTab.classList.remove("active");
  builderTab.classList.remove("active");
}

function showBuilderPage() {
  builderTransportSlot.append(transportPanel);
  practiceView.hidden = true;
  notationGuidePage.hidden = true;
  builderPage.hidden = false;
  notationGuideTab.classList.remove("active");
  builderTab.classList.add("active");
}

function resetPageState() {
  stopPlayback();
  const selectedChart = getSelectedChart();
  state.bpm = 110;
  state.volume = 0.8;
  state.repeat = true;
  state.clickEnabled = true;
  state.clickIntervalSteps = 2;
  state.clickVolume = 0.5;
  state.builderSteps = [...selectedChart.steps];
  state.builderScoreMode = selectedChart.scoreMode || null;
  state.builderScoreData = selectedChart.scoreData;
  state.builderMetadata = { name: selectedChart.name, difficulty: selectedChart.difficulty };
  state.builderJsonDirty = false;
  state.builderActiveMode = "random";
  state.builderBeat = selectedChart.beat;
  state.builderTicksPerBar = selectedChart.scoreData.ticksPerBar;
  state.builderDirections = [...selectedChart.scoreData.directions];
  state.builderSelectedType = "L";
  state.midiRecord = [];
  state.recordingMidi = false;

  bpmSlider.value = "110";
  volumeSlider.value = "80";
  repeatToggle.checked = true;
  clickToggle.checked = true;
  clickDivisionInputs.forEach((input) => {
    input.checked = input.value === "2";
  });
  clickVolumeSlider.value = "50";
  playToggle.textContent = "再生";
  playToggle.setAttribute("aria-pressed", "false");
  recordMidiButton.textContent = "記録開始";
  midiStatusEl.textContent = state.midiConnected ? "MIDI接続済み" : "MIDI未接続";
  midiLogEl.textContent = "記録データはまだありません。";

  chartHelpPanel.hidden = true;
  chartHelpToggle.setAttribute("aria-expanded", "false");
  chartHelpToggle.setAttribute("aria-label", "譜面の見方を表示");
  chartHelpToggle.title = "譜面の見方";
  document.querySelectorAll(".step-type").forEach((button) => {
    const isSelected = button.dataset.stepType === "L";
    button.classList.toggle("active", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });
  setBuilderMode("random");

  render();
}

notationGuideTab.addEventListener("click", () => {
  resetPageState();
  if (state.isPlaying) {
    stopPlayback();
  }
  practiceView.hidden = true;
  notationGuidePage.hidden = false;
  builderPage.hidden = true;
  notationGuideTab.classList.add("active");
  builderTab.classList.remove("active");
});

chartHelpToggle.addEventListener("click", () => {
  chartHelpPanel.hidden = !chartHelpPanel.hidden;
  const isExpanded = !chartHelpPanel.hidden;
  chartHelpToggle.setAttribute("aria-expanded", String(isExpanded));
  chartHelpToggle.setAttribute("aria-label", isExpanded ? "譜面の見方を閉じる" : "譜面の見方を表示");
  chartHelpToggle.title = isExpanded ? "譜面の見方を閉じる" : "譜面の見方";
});

function updateTransportValues() {
  bpmValueEl.textContent = `${state.bpm}`;
  volumeValueEl.textContent = `${Math.round(state.volume * 100)}%`;
  clickVolumeValueEl.textContent = `${Math.round(state.clickVolume * 100)}%`;
  patternLengthValue.textContent = `${getBuilderBarCount()}`;
}

function getBuilderBarCount() {
  return state.builderScoreData?.source.score.length
    ?? Math.ceil(state.builderSteps.length / state.builderTicksPerBar);
}

function setBuilderMode(mode) {
  state.builderActiveMode = mode;
  builderModeTabs.forEach((tab) => {
    const isActive = tab.id === `builder-${mode}-tab`;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
    tab.tabIndex = isActive ? 0 : -1;
  });
  builderModePanels.forEach((panel) => {
    panel.hidden = panel.id !== `builder-${mode}-panel`;
  });
  if (mode === "json" && !state.builderJsonDirty) syncChartJson();
}

builderModeTabs.forEach((tab) => {
  tab.addEventListener("click", () => setBuilderMode(tab.id.replace("builder-", "").replace("-tab", "")));
});

function updateBuilderSummary() {
  const details = [
    ["譜面名", state.builderMetadata.name || "無題"],
    ["難易度", state.builderMetadata.difficulty || "未設定"],
    ["拍子", state.builderBeat],
    ["小節", `${getBuilderBarCount()} 小節`],
  ];
  builderChartInfoEl.replaceChildren(...details.map(([label, value]) => {
    const item = document.createElement("div");
    item.className = "builder-info-item";
    const caption = document.createElement("span");
    caption.textContent = label;
    const content = document.createElement("strong");
    content.textContent = value;
    item.append(caption, content);
    return item;
  }));

  const manualItems = [
    `${state.builderMetadata.name || "無題"}`,
    state.builderMetadata.difficulty || "難易度未設定",
    state.builderBeat,
    `${getBuilderBarCount()} 小節`,
    `${state.builderTicksPerBar} セル / 小節`,
  ];
  builderManualInfoEl.replaceChildren(...manualItems.map((value) => {
    const item = document.createElement("span");
    item.textContent = value;
    return item;
  }));
}

function updateBuilderEditor() {
  builderStepsEl.innerHTML = "";

  const cellsPerBar = state.builderTicksPerBar;
  const stepLabels = { L: "前進", R: "後進", M: "無音", C: "チョップ", K: "キープ", S: "3クリック", "-": "継続" };
  const compiledScore = state.builderScoreData || compileScoreData(createBuilderScoreDocument());
  const notationLabels = Array(compiledScore.totalTicks).fill("");
  compiledScore.events.forEach((event) => {
    const notation = event.keep
      ? "K"
      : event.modifier === "-"
        ? "–"
        : `${event.direction}${event.modifier}`;
    for (let tick = event.startTick; tick < event.startTick + event.durationTicks; tick += 1) {
      notationLabels[tick] = notation;
    }
  });
  const bars = Math.ceil(state.builderSteps.length / cellsPerBar);
  for (let bar = 0; bar < bars; bar += 1) {
    const barEl = document.createElement("section");
    barEl.className = "builder-bar";
    const heading = document.createElement("h4");
    heading.textContent = `小節 ${bar + 1}`;
    const cells = document.createElement("div");
    cells.className = "builder-bar-cells";
    const barEnd = Math.min(state.builderSteps.length, (bar + 1) * cellsPerBar);
    for (let index = bar * cellsPerBar; index < barEnd; index += 1) {
      const step = state.builderSteps[index];
      const button = document.createElement("button");
      button.type = "button";
      button.className = `builder-step step-${step === "-" ? "continue" : step.toLowerCase()} ${index === state.currentStep && state.isPlaying ? "active" : ""}`;
      const notation = notationLabels[index] || (step === "-" ? "–" : step);
      button.setAttribute("aria-label", `小節 ${bar + 1}、位置 ${index - bar * cellsPerBar + 1}: ${notation}（${stepLabels[step] || step}）`);
      button.innerHTML = `<span>${notation}</span><small>${index - bar * cellsPerBar + 1}</small>`;
      button.title = `${notation} · ${stepLabels[step] || step} · 小節 ${bar + 1} · ${index - bar * cellsPerBar + 1}セル目`;
      button.addEventListener("click", () => {
        const nextType = state.builderSelectedType;
        state.builderSteps[index] = nextType;
        if (nextType === "L") state.builderDirections[index] = "F";
        if (nextType === "R") state.builderDirections[index] = "B";
        recompileBuilderScore();
        state.builderJsonDirty = false;
        renderBuilder();
      });
      cells.appendChild(button);
    }
    barEl.append(heading, cells);
    builderStepsEl.appendChild(barEl);
  }

  if (!state.builderJsonDirty) {
    chartJsonEl.value = JSON.stringify(createBuilderScoreDocument(), null, 2);
    jsonStatusEl.textContent = "現在の譜面JSONです。編集後は「編集内容を反映」またはファイル保存ができます。";
    jsonStatusEl.classList.remove("error");
  }
  updateBuilderSummary();
}

function updateToolHint() {
  const labels = {
    L: "前進を選択中。時間セルをクリックして配置します。",
    R: "後進を選択中。時間セルをクリックして配置します。",
    M: "ミュートを選択中。時間セルをクリックして配置します。",
    C: "チョップを選択中。時間セルをクリックして配置します。",
    P: "フレアを選択中。時間セルをクリックして配置します。",
    K: "キープを選択中。時間セルをクリックして配置します。",
    S: "3クリックを選択中。時間セルをクリックして配置します。",
    "-": "継続を選択中。時間セルをクリックして配置します。",
  };
  builderToolHintEl.textContent = labels[state.builderSelectedType] || "";
}

function renderBuilder() {
  patternLengthInput.value = String(getBuilderBarCount());
  updateTransportValues();
  updateBuilderEditor();
  updateToolHint();
  renderBuilderScore();
}

function renderBuilderScore() {
  const chart = getBuilderChart();
  builderScoreEl.innerHTML = buildScratchSvg(chart.steps, chart, state);
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
    faderOpen = true;
    return "-";
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
  state.builderScoreMode = null;
  const chart = getSelectedChart();
  const source = {
    name: state.builderMetadata.name,
    difficulty: state.builderMetadata.difficulty,
    beat: state.builderBeat,
    score: legacyStepsToScore({ ...chart, scoreMode: null }, state.builderSteps),
  };
  const compiled = compileScoreData(source);
  state.builderScoreData = compiled;
  state.builderSteps = compiled.steps;
  state.builderDirections = compiled.directions;
  state.builderTicksPerBar = compiled.ticksPerBar;
  state.builderBeat = compiled.beat;
}

function render() {
  renderChartList();
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

        const continuesFlareTail = (candidate) => candidate.modifier === "-" || candidate.modifier === "";
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
      state.currentStep = 0;
    } else {
      stopPlayback();
      return;
    }
  } else {
    state.currentStep += 1;
  }
}

function stopPlayback() {
  const wasBuilderPlayback = state.isBuilderPlayback;
  state.isPlaying = false;
  state.currentStep = 0;
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
  playToggle.textContent = "再生";
  playToggle.setAttribute("aria-pressed", "false");
  if (wasBuilderPlayback) {
    renderBuilderScore();
  } else {
    renderSelectedChart();
  }
  state.isBuilderPlayback = false;
}

function startPlayback(isBuilderPlayback = false) {
  initializeAudio();
  state.isBuilderPlayback = isBuilderPlayback;
  const chart = getPlaybackChart();
  if (!chart.steps.length) {
    return;
  }

  state.isPlaying = true;
  playToggle.textContent = "停止";
  playToggle.setAttribute("aria-pressed", "true");

  if (state.timer) {
    clearInterval(state.timer);
  }

  const noteLengthMs = chart.scoreData
    ? chart.scoreData.tickDurationSeconds * (60000 / state.bpm)
    : chart.scoreGrid
      ? (60 / state.bpm) * chart.scoreGrid.beatsPerBar / chart.scoreGrid.ticksPerBar * 1000
      : (60000 / state.bpm) / 2;
  state.timer = setInterval(() => {
    advancePlayback();
  }, noteLengthMs);

  advancePlayback();
}

playToggle.addEventListener("click", () => {
  if (state.isPlaying) {
    stopPlayback();
    return;
  }
  startPlayback(!builderPage.hidden);
});

bpmSlider.addEventListener("input", (event) => {
  state.bpm = Number(event.target.value);
  updateTransportValues();
  if (state.isPlaying) {
    startPlayback(state.isBuilderPlayback);
  }
});

volumeSlider.addEventListener("input", (event) => {
  state.volume = Number(event.target.value) / 100;
  updateTransportValues();
});

repeatToggle.addEventListener("change", (event) => {
  state.repeat = event.target.checked;
});

clickToggle.addEventListener("change", (event) => {
  state.clickEnabled = event.target.checked;
});

clickDivisionInputs.forEach((input) => {
  input.addEventListener("change", (event) => {
    if (event.target.checked) {
      state.clickIntervalSteps = Number(event.target.value);
    }
  });
});

clickVolumeSlider.addEventListener("input", (event) => {
  state.clickVolume = Number(event.target.value) / 100;
  updateTransportValues();
});

patternLengthInput.addEventListener("input", (event) => {
  const nextLength = Number(event.target.value) * state.builderTicksPerBar;
  const existing = state.builderSteps;

  if (existing.length < nextLength) {
    while (existing.length < nextLength) {
      existing.push("L");
    }
  } else {
    state.builderSteps = existing.slice(0, nextLength);
  }

  state.builderDirections = deriveBuilderDirections(state.builderSteps);
  recompileBuilderScore();
  state.builderJsonDirty = false;
  renderBuilder();
});

document.querySelectorAll(".step-type").forEach((button) => {
  button.addEventListener("click", () => {
    state.builderSelectedType = button.dataset.stepType;
    document.querySelectorAll(".step-type").forEach((btn) => {
      const isSelected = btn === button;
      btn.classList.toggle("active", isSelected);
      btn.setAttribute("aria-pressed", String(isSelected));
    });
    updateToolHint();
  });
});

function syncChartJson() {
  chartJsonEl.value = JSON.stringify(createBuilderScoreDocument(), null, 2);
  state.builderJsonDirty = false;
  jsonStatusEl.textContent = "現在の譜面JSONです。編集後は「編集内容を反映」またはファイル保存ができます。";
  jsonStatusEl.classList.remove("error");
}

document.getElementById("random-pattern").addEventListener("click", () => {
  const difficulty = document.getElementById("generator-difficulty").value;
  const minimumBeat = Number(document.getElementById("generator-min-beat").value);
  const includeTriplets = document.getElementById("generator-triplets").checked;
  const includeSyncopation = document.getElementById("generator-syncopation").checked;
  const includeChops = document.getElementById("generator-chops").checked;
  const includeFlares = document.getElementById("generator-flares").checked;
  const includeKeeps = document.getElementById("generator-keeps").checked;
  const [numerator, denominator] = state.builderBeat.split("/").map(Number);
  const beatsPerBar = numerator * 4 / denominator;
  const baseEventCount = Math.max(1, Math.floor(beatsPerBar / minimumBeat));
  const bars = [];
  let lastDirection = "B";
  let faderOpen = true;

  for (let bar = 0; bar < getBuilderBarCount(); bar += 1) {
    const tripletIndex = includeTriplets ? Math.floor(Math.random() * baseEventCount) : -1;
    const events = [];
    for (let index = 0; index < baseEventCount; index += 1) {
      const tripletCount = index === tripletIndex ? 3 : 1;
      const tokens = [];
      for (let subdivision = 0; subdivision < tripletCount; subdivision += 1) {
        const beatPosition = index * minimumBeat + subdivision * minimumBeat / tripletCount;
        const isStrongBeat = Math.abs(beatPosition - Math.round(beatPosition)) < 0.001;
        if (includeSyncopation && isStrongBeat && (bar > 0 || index > 0) && Math.random() < 0.45) {
          tokens.push(`${lastDirection}M`);
          faderOpen = false;
          continue;
        }

        if (includeKeeps && Math.random() < (difficulty === "Hard" ? 0.16 : 0.1)) {
          tokens.push("K");
          continue;
        }

        const techniqueRoll = Math.random();
        const techniqueChance = difficulty === "Hard" ? 0.34 : difficulty === "Medium" ? 0.2 : 0.1;
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
  state.builderScoreData = generated;
  state.builderSteps = generated.steps;
  state.builderDirections = generated.directions;
  state.builderTicksPerBar = generated.ticksPerBar;
  state.builderBeat = generated.beat;
  state.builderMetadata = { name: generated.source.name, difficulty };
  state.builderScoreMode = null;
  state.builderJsonDirty = false;
  renderBuilder();
  setBuilderMode("manual");
});

document.getElementById("manual-fill").addEventListener("click", () => {
  state.builderSteps = Array.from({ length: state.builderSteps.length }, (_, i) => (i % 2 === 0 ? "L" : "R"));
  state.builderDirections = deriveBuilderDirections(state.builderSteps);
  recompileBuilderScore();
  state.builderJsonDirty = false;
  renderBuilder();
});

document.getElementById("export-json").addEventListener("click", () => {
  let data;
  try {
    if (state.builderJsonDirty) {
      const edited = JSON.parse(chartJsonEl.value);
      compileScoreData(edited);
      data = JSON.stringify(edited, null, 2);
    } else {
      data = JSON.stringify(createBuilderScoreDocument(), null, 2);
    }
  } catch (error) {
    jsonStatusEl.textContent = `保存できません: ${error.message}`;
    jsonStatusEl.classList.add("error");
    return;
  }

  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const filename = (state.builderMetadata.name || "scratch-chart")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "scratch-chart";
  link.download = `${filename}.json`;
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  jsonStatusEl.textContent = "譜面JSONをファイルに保存しました。";
  jsonStatusEl.classList.remove("error");
});

function loadChartJson(parsed) {
  if (parsed && Array.isArray(parsed.score)) {
    const compiled = compileScoreData(parsed);
    state.builderScoreData = compiled;
    state.builderSteps = compiled.steps;
    state.builderDirections = compiled.directions;
    state.builderBeat = compiled.beat;
    state.builderTicksPerBar = compiled.ticksPerBar;
    state.builderScoreMode = null;
    state.builderMetadata = { name: parsed.name, difficulty: parsed.difficulty };
  } else if (parsed && Array.isArray(parsed.steps)) {
    state.builderSteps = parsed.steps;
    state.builderDirections = deriveBuilderDirections(state.builderSteps);
    state.builderBeat = "4/4";
    state.builderTicksPerBar = 8;
    state.builderScoreMode = null;
    state.builderScoreData = null;
    state.builderMetadata = {
      name: parsed.name || getSelectedChart().name,
      difficulty: parsed.difficulty || getSelectedChart().difficulty,
    };
  } else {
    throw new Error("score配列を持つ譜面データが必要です。");
  }
  state.builderJsonDirty = false;
  renderBuilder();
  jsonStatusEl.textContent = "JSONを譜面に反映しました。";
  jsonStatusEl.classList.remove("error");
}

document.getElementById("import-json").addEventListener("click", () => {
  try {
    const parsed = JSON.parse(chartJsonEl.value);
    loadChartJson(parsed);
  } catch (error) {
    jsonStatusEl.textContent = `JSONエラー: ${error.message}`;
    jsonStatusEl.classList.add("error");
  }
});

chartJsonEl.addEventListener("input", () => {
  state.builderJsonDirty = true;
  jsonStatusEl.textContent = "未反映の変更があります。反映してから保存すると最新データになります。";
  jsonStatusEl.classList.remove("error");
});

document.getElementById("json-load-file").addEventListener("click", () => chartJsonFileInput.click());

chartJsonFileInput.addEventListener("change", async () => {
  const [file] = chartJsonFileInput.files || [];
  if (!file) return;
  try {
    loadChartJson(JSON.parse(await file.text()));
  } catch (error) {
    jsonStatusEl.textContent = `JSONファイル読み込みエラー: ${error.message}`;
    jsonStatusEl.classList.add("error");
  } finally {
    chartJsonFileInput.value = "";
  }
});

builderTab.addEventListener("click", () => {
  resetPageState();
  showBuilderPage();
});

async function connectMIDI() {
  if (!navigator.requestMIDIAccess) {
    midiStatusEl.textContent = "このブラウザはWeb MIDI APIに対応していません。";
    midiLogEl.textContent = "MIDIデバイスに接続できません。キーボード操作や手動生成で試してください。";
    return;
  }

  try {
    const access = await navigator.requestMIDIAccess();
    state.midiAccess = access;
    state.midiConnected = true;
    midiStatusEl.textContent = "MIDI接続済み";

    access.inputs.forEach((input) => {
      input.onmidimessage = (event) => {
        const [status, note, velocity] = event.data;
        const log = `status=${status}, note=${note}, velocity=${velocity}`;
        state.midiRecord.push({ status, note, velocity, time: Date.now() });

        if (state.recordingMidi) {
          midiLogEl.textContent = `${log}\n記録中... ${state.midiRecord.length}件`;
        } else {
          midiLogEl.textContent = `MIDI入力: ${log}`;
        }
      };
    });
  } catch (error) {
    midiStatusEl.textContent = "MIDI接続に失敗しました";
    const denied = error.name === "SecurityError" || error.name === "NotAllowedError" || /permission/i.test(error.message);
    midiLogEl.textContent = denied
      ? `${error.message}\nVS Code内蔵ブラウザではWeb MIDIの権限が許可されません。Chrome/Edgeで http://localhost などから開いて、MIDIの許可を「許可」にしてください。`
      : error.message;
  }
}

midiConnectButton.addEventListener("click", connectMIDI);

recordMidiButton.addEventListener("click", () => {
  state.recordingMidi = !state.recordingMidi;
  state.midiRecord = [];
  recordMidiButton.textContent = state.recordingMidi ? "記録中止" : "記録開始";
  midiLogEl.textContent = state.recordingMidi ? "MIDI記録を開始しました。DJコントローラの入力を4カウント後から記録します。" : "記録を停止しました。";
});

compareMidiButton.addEventListener("click", () => {
  if (!state.midiRecord.length) {
    midiLogEl.textContent = "比較するMIDI記録がありません。";
    return;
  }

  const recordedCount = state.midiRecord.filter((item) => item.status >= 144).length;
  const expectedCount = getSelectedChart().steps.length;
  const similarity = Math.min(100, Math.round((recordedCount / expectedCount) * 100));
  midiLogEl.textContent = `MIDI比較結果: ${recordedCount} / ${expectedCount} パターン一致 (${similarity}%)\n記録数: ${state.midiRecord.length}`;
});

bpmSlider.value = String(state.bpm);
volumeSlider.value = String(Math.round(state.volume * 100));
clickVolumeSlider.value = String(Math.round(state.clickVolume * 100));
repeatToggle.checked = true;
clickToggle.checked = true;
patternLengthInput.value = String(getBuilderBarCount());
render();
