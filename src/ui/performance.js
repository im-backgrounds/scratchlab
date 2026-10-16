import {
  buildTimeline,
  COUNT_KEYS,
  COUNT_LABELS,
  createEmptyCounts,
  formatDuration,
} from "../domain/performance.js";

const LANE_KIND_LABELS = {
  forward: "Forward",
  backward: "Backward",
  stop: "Stop",
  open: "Fader Open",
  closed: "Fader Close",
};

export function bindPerformance({ onToggleRecording, onExport }) {
  document.getElementById("performance-record").addEventListener(
    "click",
    onToggleRecording,
  );
  document.getElementById("performance-export").addEventListener(
    "click",
    onExport,
  );
}

export function renderPerformanceRecording(isRecording) {
  const button = document.getElementById("performance-record");
  button.textContent = isRecording ? "記録を停止" : "記録を開始";
  button.setAttribute("aria-pressed", String(isRecording));
  document.getElementById("performance-panel").classList.toggle(
    "is-recording",
    isRecording,
  );
}

export function renderPerformanceStatus(message) {
  document.getElementById("performance-status").textContent = message;
}

function renderCounts(counts) {
  const list = document.getElementById("performance-counts");
  list.replaceChildren();
  for (const key of COUNT_KEYS) {
    const item = document.createElement("div");
    item.className = `performance-count performance-count-${key}`;
    const label = document.createElement("dt");
    label.textContent = COUNT_LABELS[key];
    const value = document.createElement("dd");
    value.textContent = String(counts[key]);
    item.append(label, value);
    list.append(item);
  }
}

function renderTimeline(performance) {
  const container = document.getElementById("performance-timeline");
  container.replaceChildren();
  if (!performance || !performance.events.length) {
    container.classList.add("is-empty");
    container.textContent = "記録されたイベントはまだありません。";
    return;
  }
  container.classList.remove("is-empty");
  const timeline = buildTimeline(performance);
  for (const lane of timeline.lanes) {
    const row = document.createElement("div");
    row.className = "performance-lane";
    const label = document.createElement("span");
    label.className = "performance-lane-label";
    label.textContent = lane.label;
    const track = document.createElement("div");
    track.className = "performance-lane-track";
    for (const segment of lane.segments) {
      const bar = document.createElement("span");
      bar.className = `performance-segment performance-segment-${segment.kind}`;
      bar.style.left = `${segment.left}%`;
      bar.style.width = `${segment.width}%`;
      bar.title = `${LANE_KIND_LABELS[segment.kind]} ${
        formatDuration(segment.startMs)
      }`;
      track.append(bar);
    }
    row.append(label, track);
    container.append(row);
  }
  const axis = document.createElement("div");
  axis.className = "performance-axis";
  axis.append(
    Object.assign(document.createElement("span"), { textContent: "0:00.000" }),
    Object.assign(document.createElement("span"), {
      textContent: formatDuration(timeline.durationMs),
    }),
  );
  container.append(axis);
}

/**
 * Renders the finished performance, or the empty state when there is none.
 * @param {object|null} performance A normalized performance.
 */
export function renderPerformance(performance) {
  renderCounts(performance ? performance.counts : createEmptyCounts());
  document.getElementById("performance-duration").textContent = performance
    ? formatDuration(performance.durationMs)
    : "0:00.000";
  document.getElementById("performance-total").textContent = performance
    ? String(performance.events.length)
    : "0";
  document.getElementById("performance-export").disabled = !performance;
  renderTimeline(performance);
}

export function downloadPerformance(text, filename) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const ANALYSIS_TOTALS = [
  ["matched", "一致 (matched)"],
  ["missing", "不足 (missing)"],
  ["extra", "余分 (extra)"],
];

/**
 * Renders the comparison with the expected chart events.
 * @param {object|null} analysis Result of analyzePerformance, or null.
 * @param {string} chartName Name of the chart compared against.
 */
export function renderPerformanceAnalysis(analysis, chartName) {
  const note = document.getElementById("performance-analysis-chart");
  const accuracy = document.getElementById("performance-accuracy");
  const totals = document.getElementById("performance-analysis-totals");
  const rows = document.getElementById("performance-analysis-rows");
  totals.replaceChildren();
  rows.replaceChildren();
  document.getElementById("performance-analysis").classList.toggle(
    "is-empty",
    !analysis,
  );

  if (!analysis) {
    note.textContent = "記録すると、選択中の譜面と比較します。";
    accuracy.textContent = "—";
    return;
  }

  note.textContent =
    `「${chartName}」の動作順と比較しています（タイミングは評価しません）。`;
  accuracy.textContent = analysis.accuracy === null
    ? "—"
    : `${analysis.accuracy.toFixed(1)}%`;

  for (const [key, label] of ANALYSIS_TOTALS) {
    const item = document.createElement("div");
    item.className = `performance-count performance-analysis-${key}`;
    const term = document.createElement("dt");
    term.textContent = label;
    const value = document.createElement("dd");
    value.textContent = String(analysis[key]);
    item.append(term, value);
    totals.append(item);
  }

  for (const key of COUNT_KEYS) {
    const tally = analysis.byKind[key];
    const row = document.createElement("tr");
    const head = document.createElement("th");
    head.scope = "row";
    head.textContent = COUNT_LABELS[key];
    row.append(head);
    for (const field of ["matched", "missing", "extra"]) {
      const cell = document.createElement("td");
      cell.textContent = String(tally[field]);
      row.append(cell);
    }
    rows.append(row);
  }
}
