export function bindControls({
  onShowGuide,
  onStartFirstVisitGuide,
  onSkipFirstVisitGuide,
  onTryBabyScratch,
  onShowBuilder,
  onShowMidiSetup,
  onShowPractice,
  onShowAchievements,
  onConnectMidi,
  onSelectMidiInput,
}) {
  const sidebar = document.getElementById("sidebar");
  const mobileMenuToggle = document.getElementById("mobile-menu-toggle");
  const mainPanel = document.querySelector(".main-panel");
  const notationGuideTab = document.getElementById("notation-guide-tab");
  const firstVisitGuideStart = document.getElementById(
    "first-visit-guide-start",
  );
  const firstVisitGuideSkip = document.getElementById(
    "first-visit-guide-skip",
  );
  const builderTab = document.getElementById("builder-tab");
  const chartHelpToggle = document.getElementById("chart-help-toggle");
  const chartHelpPanel = document.getElementById("chart-help-panel");
  const midiConnectButton = document.getElementById("midi-connect");
  const midiInputSelect = document.getElementById("midi-input-select");
  const midiSetupTab = document.getElementById("midi-setup-tab");
  const midiSetupReturn = document.getElementById("midi-setup-return");
  const achievementsTab = document.getElementById("achievements-tab");

  const setMobileMenuOpen = (isOpen, restoreFocus = false) => {
    document.body.classList.toggle("mobile-menu-open", isOpen);
    mobileMenuToggle.setAttribute("aria-expanded", String(isOpen));
    mobileMenuToggle.setAttribute(
      "aria-label",
      isOpen ? "メニューを閉じる" : "メニューを開く",
    );
    mainPanel.inert = isOpen;
    if (!isOpen && restoreFocus) {
      mobileMenuToggle.focus({ preventScroll: true });
    }
  };

  mobileMenuToggle.addEventListener("click", () => {
    setMobileMenuOpen(!document.body.classList.contains("mobile-menu-open"));
  });

  sidebar.addEventListener("click", (event) => {
    if (event.target.closest("button")) setMobileMenuOpen(false, true);
  });

  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      document.body.classList.contains("mobile-menu-open")
    ) {
      setMobileMenuOpen(false, true);
    }
  });

  notationGuideTab.addEventListener("click", onShowGuide);
  firstVisitGuideStart.addEventListener("click", onStartFirstVisitGuide);
  firstVisitGuideSkip.addEventListener("click", onSkipFirstVisitGuide);
  document.getElementById("guide-try-baby-scratch").addEventListener(
    "click",
    onTryBabyScratch,
  );
  builderTab.addEventListener("click", onShowBuilder);
  midiSetupTab.addEventListener("click", onShowMidiSetup);
  midiSetupReturn.addEventListener("click", onShowPractice);
  achievementsTab.addEventListener("click", onShowAchievements);

  chartHelpToggle.addEventListener("click", () => {
    chartHelpPanel.hidden = !chartHelpPanel.hidden;
    const isExpanded = !chartHelpPanel.hidden;
    chartHelpToggle.setAttribute("aria-expanded", String(isExpanded));
    chartHelpToggle.setAttribute(
      "aria-label",
      isExpanded ? "譜面の見方を閉じる" : "譜面の見方を表示",
    );
    chartHelpToggle.title = isExpanded ? "譜面の見方を閉じる" : "譜面の見方";
  });

  midiConnectButton.addEventListener("click", onConnectMidi);
  midiInputSelect.addEventListener(
    "change",
    (event) => onSelectMidiInput(event.target.value),
  );
}

export function renderResetControls(state) {
  document.getElementById("bpm-slider").value = "110";
  document.getElementById("volume-slider").value = "80";
  document.getElementById("repeat-toggle").checked = true;
  document.getElementById("click-toggle").checked = true;
  document.querySelectorAll('input[name="click-division"]').forEach((input) => {
    input.checked = input.value === "2";
  });
  document.getElementById("click-volume-slider").value = "50";
  setPlaybackButton(false);
  renderMidiStatus(
    state.midiConnected ? "MIDI接続済み" : "MIDI未接続",
    "MIDI入力はまだありません。",
  );
  renderChartHelp(false);
  document.querySelectorAll(".step-type").forEach((button) => {
    const isSelected = button.dataset.stepType === "L";
    button.classList.toggle("active", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });
}

export function renderInitialControls(state, builderBarCount) {
  document.getElementById("bpm-slider").value = String(state.bpm);
  document.getElementById("volume-slider").value = String(
    Math.round(state.volume * 100),
  );
  document.getElementById("click-volume-slider").value = String(
    Math.round(state.clickVolume * 100),
  );
  document.getElementById("repeat-toggle").checked = true;
  document.getElementById("click-toggle").checked = true;
  document.getElementById("pattern-length").value = String(builderBarCount);
}

export function setPlaybackButton(isPlaying) {
  const button = document.getElementById("play-toggle");
  button.textContent = isPlaying ? "停止" : "再生";
  button.setAttribute("aria-pressed", String(isPlaying));
}

export function renderMidiStatus(status, log) {
  document.getElementById("midi-status").textContent = status;
  document.getElementById("midi-log").textContent = log;
}

export function renderMidiConnectionStatus(status) {
  document.getElementById("midi-status").textContent = status;
}

export function renderMidiLog(log) {
  document.getElementById("midi-log").textContent = log;
}

export function renderChartHelp(isVisible) {
  const panel = document.getElementById("chart-help-panel");
  const toggle = document.getElementById("chart-help-toggle");
  panel.hidden = !isVisible;
  toggle.setAttribute("aria-expanded", String(isVisible));
  toggle.setAttribute(
    "aria-label",
    isVisible ? "譜面の見方を閉じる" : "譜面の見方を表示",
  );
  toggle.title = isVisible ? "譜面の見方を閉じる" : "譜面の見方";
}

export function renderFirstVisitGuidance(isVisible, message = "") {
  document.getElementById("first-visit-guidance").hidden = !isVisible;
  const status = document.getElementById("first-visit-guidance-status");
  status.textContent = message;
  status.hidden = !message;
}

const PAGE_IDS = [
  "practice-view",
  "notation-guide-page",
  "builder-page",
  "midi-setup-page",
  "achievements-page",
];
const TAB_IDS = [
  "notation-guide-tab",
  "builder-tab",
  "midi-setup-tab",
  "achievements-tab",
];

function showPage(pageId, activeTabId) {
  for (const id of PAGE_IDS) document.getElementById(id).hidden = id !== pageId;
  for (const id of TAB_IDS) {
    document.getElementById(id).classList.toggle("active", id === activeTabId);
  }
}

export function renderGuideView() {
  showPage("notation-guide-page", "notation-guide-tab");
}

export function renderPracticeView() {
  document.getElementById("practice-transport-slot").append(
    document.getElementById("transport-panel"),
  );
  showPage("practice-view", null);
}

export function renderBuilderView() {
  document.getElementById("builder-transport-slot").append(
    document.getElementById("transport-panel"),
  );
  showPage("builder-page", "builder-tab");
}

export function renderMidiSetupView() {
  showPage("midi-setup-page", "midi-setup-tab");
}

export function renderAchievementsView() {
  showPage("achievements-page", "achievements-tab");
}
