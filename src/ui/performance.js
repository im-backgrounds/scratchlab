import {
  buildTimeline,
  COUNT_KEYS,
  COUNT_LABELS,
  createEmptyCounts,
  formatDuration,
} from "../domain/performance.js";
import { analyzePerformance } from "../domain/performance-analysis.js";

const LANE_KIND_LABELS = {
  forward: "Forward",
  backward: "Backward",
  stop: "Stop",
  open: "Fader Open",
  closed: "Fader Close",
};

export function bindPerformance({ onExport }) {
  document.getElementById("performance-export").addEventListener(
    "click",
    onExport,
  );
}

export function renderPerformanceRecording(isRecording) {
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

function getExpectedOverlayEvents(scoreData) {
  const events = [];
  let faderOpen = true;
  const addFader = (open, tick) => {
    events.push({ kind: open ? "open" : "closed", tick });
    faderOpen = open;
  };

  for (const event of scoreData.events) {
    if (event.keep) continue;
    if (event.faderOpen !== faderOpen) {
      addFader(event.faderOpen, event.startTick);
    }
    events.push({
      kind: event.direction === "F" ? "forward" : "backward",
      tick: event.startTick,
    });
    for (let cut = 0; event.faderOpen && cut < event.cutCount; cut += 1) {
      const tick = event.startTick +
        event.durationTicks * (cut + 1) / (event.cutCount + 1);
      addFader(false, tick);
      addFader(true, tick);
    }
  }
  if (events.length) {
    events.push({ kind: "stop", tick: scoreData.totalTicks });
  }
  return events;
}

function renderOverlayLane(
  container,
  label,
  lane,
  events,
  scoreData,
  progress = null,
) {
  const row = document.createElement("div");
  row.className = "performance-lane controller-overlay-lane";
  const name = document.createElement("span");
  name.className = "performance-lane-label";
  name.textContent = label;
  const track = document.createElement("div");
  track.className = "performance-lane-track controller-overlay-track";
  track.style.marginLeft = `${24 / 780 * 100}%`;
  track.style.width = `${744 / 780 * 100}%`;
  if (progress !== null) {
    track.classList.add("is-playing");
    track.style.setProperty("--playhead-position", `${progress}%`);
  }

  const laneEvents = events.filter((event) =>
    lane === "scratch"
      ? ["forward", "backward", "stop"].includes(event.kind)
      : ["open", "closed"].includes(event.kind)
  );
  for (const [index, event] of laneEvents.entries()) {
    const end = laneEvents[index + 1]?.position ?? 100;
    const segment = document.createElement("span");
    segment.className =
      `performance-segment performance-segment-${event.kind}`;
    segment.style.left = `${Math.min(100, Math.max(0, event.position))}%`;
    segment.style.width = `${
      Math.max(0, Math.min(100, end) - Math.max(0, event.position))
    }%`;
    segment.title = `${label}: ${LANE_KIND_LABELS[event.kind]}`;
    segment.setAttribute("role", "img");
    segment.setAttribute("aria-label", segment.title);
    track.append(segment);
  }

  const ticksPerBeat = scoreData.ticksPerBar / scoreData.beatsPerBar;
  for (let tick = 0; tick <= scoreData.totalTicks; tick += 1) {
    const line = document.createElement("span");
    const isBar = tick % scoreData.ticksPerBar === 0;
    const isBeat = tick % ticksPerBeat === 0;
    line.className = isBar
      ? "controller-overlay-grid-line is-bar"
      : isBeat
      ? "controller-overlay-grid-line is-beat"
      : "controller-overlay-grid-line";
    line.style.left = `${tick / scoreData.totalTicks * 100}%`;
    track.append(line);
  }

  row.append(name, track);
  container.append(row);
}

export function renderControllerOverlay(
  scoreData,
  performance,
  analysis,
  playback = null,
) {
  const container = document.getElementById("controller-overlay");
  container.replaceChildren();
  const expected = getExpectedOverlayEvents(scoreData);
  if (playback) {
    const durationMs = scoreData.totalTicks *
      scoreData.tickDurationSeconds * 60000 / playback.bpm;
    const progressMs = Math.min(
      durationMs,
      Math.max(0, playback.currentStep * durationMs / scoreData.totalTicks),
    );
    const progress = progressMs / durationMs * 100;
    const performedEvents = playback.events
      .filter((event) =>
        event.time >= playback.startedAt &&
        event.time <= playback.startedAt + durationMs
      )
      .map((event) => ({
        kind: event.type === "scratch" ? event.direction : event.state,
        position: Math.min(
          100,
          Math.max(
            0,
            (event.time - playback.startedAt) / durationMs * 100,
          ),
        ),
      }));
    const actualKinds = playback.events
      .filter((event) =>
        event.time >= playback.startedAt &&
        event.time <= playback.startedAt + progressMs
      )
      .map((event) => ({
        type: event.type,
        ...(event.type === "scratch"
          ? { direction: event.direction }
          : { state: event.state }),
      }));
    const passedExpected = expected.filter((event) =>
      event.tick < playback.currentStep
    ).map((event) => ({
      type: event.kind === "open" || event.kind === "closed"
        ? "fader"
        : "scratch",
      ...(event.kind === "open" || event.kind === "closed"
        ? { state: event.kind }
        : { direction: event.kind }),
    }));
    const liveAnalysis = actualKinds.length
      ? analyzePerformance(passedExpected, actualKinds)
      : null;
    renderOverlayLane(
      container,
      "入力 · スクラッチ",
      "scratch",
      performedEvents,
      scoreData,
      playback.isPlaying ? progress : null,
    );
    renderOverlayLane(
      container,
      "入力 · フェーダー",
      "fader",
      performedEvents,
      scoreData,
      playback.isPlaying ? progress : null,
    );
    const error = document.createElement("p");
    error.className = liveAnalysis &&
        liveAnalysis.missing + liveAnalysis.extra > 0
      ? "controller-overlay-error-summary"
      : "controller-overlay-status";
    error.textContent = !playback.isPlaying
      ? "再生停止 · 入力を保持しています。"
      : liveAnalysis
      ? `Error: 未一致 ${liveAnalysis.missing}件 / 余分 ${liveAnalysis.extra}件`
      : "再生中：入力を待っています。";
    container.append(error);
    return;
  }

  const loops = performance?.loopEnds?.length
    ? [...performance.loopEnds, performance.durationMs]
    : [performance?.durationMs ?? 0];
  const performedEvents = [];
  if (performance?.durationMs > 0) {
    const loopIndex = loops.length - 1;
    const loopStart = loopIndex === 0 ? 0 : loops[loopIndex - 1];
    const loopDuration = Math.max(1, loops[loopIndex] - loopStart);
    for (const event of performance.events) {
      if (event.t < loopStart || event.t > loops[loopIndex]) continue;
      performedEvents.push({
        kind: event.type === "scratch" ? event.direction : event.state,
        position: Math.min(
          100,
          Math.max(0, (event.t - loopStart) / loopDuration * 100),
        ),
      });
    }
  }

  renderOverlayLane(
    container,
    "入力 · スクラッチ",
    "scratch",
    performedEvents,
    scoreData,
  );
  renderOverlayLane(
    container,
    "入力 · フェーダー",
    "fader",
    performedEvents,
    scoreData,
  );

  const empty = document.createElement("p");
  empty.className = "controller-overlay-empty";
  empty.textContent = performedEvents.length
    ? ""
    : "演奏を記録すると、入力イベントがここに表示されます。";
  if (!performedEvents.length) container.append(empty);

  const error = document.createElement("p");
  const hasErrors = analysis && analysis.missing + analysis.extra > 0;
  error.className = hasErrors
    ? "controller-overlay-error-summary"
    : "controller-overlay-status";
  error.textContent = hasErrors
    ? `Error: 未一致 ${analysis.missing}件 / 余分 ${analysis.extra}件`
    : analysis
    ? "Error: なし"
    : "Error: 未判定";
  container.append(error);
}
