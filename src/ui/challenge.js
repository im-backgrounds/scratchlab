function setText(id, text) {
  document.getElementById(id).textContent = text;
}

export function bindChallenge({ onStart, onRetry, onReset }) {
  document.getElementById("challenge-start").addEventListener("click", onStart);
  document.getElementById("challenge-retry").addEventListener("click", onRetry);
  document.getElementById("challenge-reset").addEventListener("click", onReset);
}

export function renderChallengeStatus(message) {
  setText("challenge-status", message);
}

/**
 * Renders the panel from a describeChallenge() result.
 * @param {object} view Result of describeChallenge.
 * @param {string} chartName Name of the chart being challenged.
 */
export function renderChallenge(view, chartName) {
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
  document.getElementById("challenge-start").disabled = !view.canStart;
  document.getElementById("challenge-retry").disabled = !view.canRetry;
  document.getElementById("challenge-reset").disabled = !view.canReset;
}

export function confirmReset(chartName) {
  return globalThis.confirm(
    `「${chartName}」のチャレンジ進捗をリセットしますか？`,
  );
}
