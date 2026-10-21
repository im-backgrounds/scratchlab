function setText(id, text) {
  document.getElementById(id).textContent = text;
}

export function bindChallenge({
  onStart,
  onReset,
  onShowMidiSetup,
  onShowPerformanceDetails,
}) {
  document.getElementById("challenge-start").addEventListener("click", onStart);
  document.getElementById("challenge-reset").addEventListener("click", onReset);
  document.getElementById("challenge-midi-setup").addEventListener(
    "click",
    onShowMidiSetup,
  );
  document.getElementById("challenge-performance-details").addEventListener(
    "click",
    onShowPerformanceDetails,
  );
}

export function renderChallengeStatus(message) {
  setText("challenge-status", message);
}

export function renderInputReadiness(readiness) {
  const list = document.getElementById("challenge-input-readiness");
  const rows = [
    `MIDI: ${readiness.midiConnected ? "接続済み" : "未接続"}`,
    `Forward: ${readiness.midiForwardMapped ? "割り当て済み" : "未割り当て"}`,
    `Backward: ${readiness.midiBackwardMapped ? "割り当て済み" : "未割り当て"}`,
    `Fader: ${readiness.midiFaderMapped ? "割り当て済み" : "未割り当て"}`,
    `練習モード: ${
      readiness.practiceModeEnabled ? "有効" : "無効"
    }（Mouse／Keyboard）`,
  ];
  list.replaceChildren(...rows.map((text) => {
    const item = document.createElement("li");
    item.textContent = text;
    return item;
  }));

  const status = document.getElementById("challenge-input-status");
  status.textContent = readiness.canStart
    ? "必要な入力が準備できています。"
    : `Challengeを始めるには、${
      readiness.missing.join("と")
    }を準備してください。`;
  status.dataset.ready = String(readiness.canStart);
}

export function renderTimingAnalysis(analysis) {
  const section = document.getElementById("challenge-timing-analysis");
  section.hidden = !analysis;
  if (!analysis) return;
  setText("challenge-measured-count", String(analysis.measuredCount));
  setText(
    "challenge-average-error",
    analysis.averageErrorMs === null
      ? "N/A"
      : `${analysis.averageErrorMs.toFixed(1)} ms`,
  );
  setText(
    "challenge-max-error",
    analysis.maxErrorMs === null
      ? "N/A"
      : `${analysis.maxErrorMs.toFixed(1)} ms`,
  );
  setText(
    "challenge-timing-accuracy",
    analysis.timingAccuracy === null
      ? "N/A"
      : `${analysis.timingAccuracy.toFixed(1)}%`,
  );
}

/**
 * Renders the panel from a describeChallenge() result.
 * @param {object} view Result of describeChallenge.
 * @param {string} chartName Name of the chart being challenged.
 */
export function renderChallenge(view, chartName, hasPerformanceAnalysis) {
  document.getElementById("challenge-panel").classList.toggle(
    "is-active",
    view.active,
  );
  setText("challenge-chart-name", chartName);
  setText(
    "challenge-current-bpm",
    view.currentBpm === null ? "—" : String(view.currentBpm),
  );
  setText(
    "challenge-highest-bpm",
    view.highestClearedBpm === null ? "—" : String(view.highestClearedBpm),
  );
  setText(
    "challenge-best-accuracy",
    view.bestAccuracy === null ? "—" : `${view.bestAccuracy.toFixed(1)}%`,
  );
  setText("challenge-attempts", String(view.attempts));
  setText("challenge-clears", String(view.clears));
  const lastAttempt = document.getElementById("challenge-last-attempt");
  lastAttempt.hidden = !view.lastAttempt;
  document.getElementById("challenge-performance-details").hidden =
    !view.lastAttempt || !hasPerformanceAnalysis;
  if (view.lastAttempt) {
    setText("challenge-last-attempt-bpm", String(view.lastAttempt.bpm));
    setText(
      "challenge-last-attempt-accuracy",
      `${view.lastAttempt.accuracy.toFixed(1)}%`,
    );
    setText(
      "challenge-last-attempt-result",
      view.lastAttempt.cleared ? "成功" : "失敗",
    );
    setText(
      "challenge-last-attempt-at",
      new Date(view.lastAttempt.at).toLocaleString("ja-JP"),
    );
  }
  document.getElementById("challenge-start").disabled = !view.canStart;
  document.getElementById("challenge-reset").disabled = !view.canReset;
}

export function confirmReset(chartName) {
  return globalThis.confirm(
    `「${chartName}」のチャレンジ進捗をリセットしますか？`,
  );
}

/**
 * Renders the Demo / Recording / Analyzing / Result progress indicator.
 * @param {{id: string, label: string, state: string}[]} steps Output of
 *   describeSessionProgress.
 */
export function renderChallengeProgress(steps) {
  const list = document.getElementById("challenge-progress");
  list.replaceChildren(...steps.map((step) => {
    const item = document.createElement("li");
    item.textContent = step.label;
    item.dataset.id = step.id;
    item.dataset.state = step.state;
    if (step.state === "current") item.setAttribute("aria-current", "step");
    return item;
  }));
}
