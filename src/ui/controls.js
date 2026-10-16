export function bindControls({
  onShowGuide,
  onShowBuilder,
  onConnectMidi,
  onToggleMidiRecording,
  onCompareMidi,
}) {
  const sidebar = document.getElementById("sidebar");
  const mobileMenuToggle = document.getElementById("mobile-menu-toggle");
  const mainPanel = document.querySelector(".main-panel");
  const notationGuideTab = document.getElementById("notation-guide-tab");
  const builderTab = document.getElementById("builder-tab");
  const chartHelpToggle = document.getElementById("chart-help-toggle");
  const chartHelpPanel = document.getElementById("chart-help-panel");
  const midiConnectButton = document.getElementById("midi-connect");
  const recordMidiButton = document.getElementById("record-midi");
  const compareMidiButton = document.getElementById("compare-midi");

  const setMobileMenuOpen = (isOpen, restoreFocus = false) => {
    document.body.classList.toggle("mobile-menu-open", isOpen);
    mobileMenuToggle.setAttribute("aria-expanded", String(isOpen));
    mobileMenuToggle.setAttribute("aria-label", isOpen ? "メニューを閉じる" : "メニューを開く");
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
    if (event.key === "Escape" && document.body.classList.contains("mobile-menu-open")) {
      setMobileMenuOpen(false, true);
    }
  });

  notationGuideTab.addEventListener("click", onShowGuide);
  builderTab.addEventListener("click", onShowBuilder);

  chartHelpToggle.addEventListener("click", () => {
    chartHelpPanel.hidden = !chartHelpPanel.hidden;
    const isExpanded = !chartHelpPanel.hidden;
    chartHelpToggle.setAttribute("aria-expanded", String(isExpanded));
    chartHelpToggle.setAttribute("aria-label", isExpanded ? "譜面の見方を閉じる" : "譜面の見方を表示");
    chartHelpToggle.title = isExpanded ? "譜面の見方を閉じる" : "譜面の見方";
  });

  midiConnectButton.addEventListener("click", onConnectMidi);
  recordMidiButton.addEventListener("click", onToggleMidiRecording);
  compareMidiButton.addEventListener("click", onCompareMidi);
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
  renderMidiRecording(state.recordingMidi);
  renderMidiStatus(state.midiConnected ? "MIDI接続済み" : "MIDI未接続", "記録データはまだありません。");
  renderChartHelp(false);
  document.querySelectorAll(".step-type").forEach((button) => {
    const isSelected = button.dataset.stepType === "L";
    button.classList.toggle("active", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });
}

export function renderInitialControls(state, builderBarCount) {
  document.getElementById("bpm-slider").value = String(state.bpm);
  document.getElementById("volume-slider").value = String(Math.round(state.volume * 100));
  document.getElementById("click-volume-slider").value = String(Math.round(state.clickVolume * 100));
  document.getElementById("repeat-toggle").checked = true;
  document.getElementById("click-toggle").checked = true;
  document.getElementById("pattern-length").value = String(builderBarCount);
}

export function setPlaybackButton(isPlaying) {
  const button = document.getElementById("play-toggle");
  button.textContent = isPlaying ? "停止" : "再生";
  button.setAttribute("aria-pressed", String(isPlaying));
}

export function renderMidiRecording(isRecording) {
  document.getElementById("record-midi").textContent = isRecording ? "記録中止" : "記録開始";
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
  toggle.setAttribute("aria-label", isVisible ? "譜面の見方を閉じる" : "譜面の見方を表示");
  toggle.title = isVisible ? "譜面の見方を閉じる" : "譜面の見方";
}

export function renderGuideView() {
  document.getElementById("practice-view").hidden = true;
  document.getElementById("notation-guide-page").hidden = false;
  document.getElementById("builder-page").hidden = true;
  document.getElementById("notation-guide-tab").classList.add("active");
  document.getElementById("builder-tab").classList.remove("active");
}

export function renderPracticeView() {
  document.getElementById("practice-transport-slot").append(document.getElementById("transport-panel"));
  document.getElementById("practice-view").hidden = false;
  document.getElementById("notation-guide-page").hidden = true;
  document.getElementById("builder-page").hidden = true;
  document.getElementById("notation-guide-tab").classList.remove("active");
  document.getElementById("builder-tab").classList.remove("active");
}

export function renderBuilderView() {
  document.getElementById("builder-transport-slot").append(document.getElementById("transport-panel"));
  document.getElementById("practice-view").hidden = true;
  document.getElementById("notation-guide-page").hidden = true;
  document.getElementById("builder-page").hidden = false;
  document.getElementById("notation-guide-tab").classList.remove("active");
  document.getElementById("builder-tab").classList.add("active");
}
