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

export function bindPerformance({ onExport, onExportSummary }) {
  document.getElementById("performance-export").addEventListener(
    "click",
    onExport,
  );
  document.getElementById("performance-summary-export").addEventListener(
    "click",
    onExportSummary,
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

export function renderPerformanceSummaryAvailability(available) {
  document.getElementById("performance-summary-export").disabled = !available;
}

export function downloadPerformanceSummary({ pattern, bpm, accuracy }) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("画像を作成できませんでした。");

  context.fillStyle = "#101923";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#38bdf8";
  context.fillRect(0, 0, 14, canvas.height);
  context.fillStyle = "#91a4b7";
  context.font = "700 25px sans-serif";
  context.fillText("SCRATCHLAB  /  PERFORMANCE", 72, 92);
  context.fillStyle = "#f4f8fc";
  context.font = "700 56px sans-serif";
  context.fillText("練習結果", 72, 174);
  context.fillStyle = "#91a4b7";
  context.font = "500 24px sans-serif";
  context.fillText("PATTERN", 72, 270);
  context.fillText("BPM", 510, 270);
  context.fillText("ACCURACY", 760, 270);
  context.fillText("RANK", 72, 430);
  context.fillStyle = "#f4f8fc";
  context.font = "700 38px sans-serif";
  context.fillText(pattern, 72, 326, 400);
  context.fillText(String(bpm), 510, 326);
  context.fillText(`${accuracy.toFixed(1)}%`, 760, 326);
  context.fillStyle = "#38bdf8";
  context.font = "700 44px sans-serif";
  context.fillText("未設定", 72, 490);
  context.fillStyle = "#91a4b7";
  context.font = "400 20px sans-serif";
  context.fillText("Keep practicing.", 72, 566);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("PNG画像を作成できませんでした。"));
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "scratchlab-performance-summary.png";
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      resolve();
    }, "image/png");
  });
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
  source,
) {
  const row = document.createElement("div");
  row.className =
    `performance-lane controller-overlay-lane controller-overlay-lane-${source}`;
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
  const eventSymbols = {
    forward: "F",
    backward: "B",
    stop: "S",
    open: "O",
    closed: "C",
  };
  for (const event of laneEvents) {
    const marker = document.createElement("span");
    marker.className =
      `controller-overlay-event controller-overlay-event-${source}`;
    marker.style.left = `${Math.min(100, Math.max(0, event.position))}%`;
    marker.textContent = source === "error" ? "!" : eventSymbols[event.kind];
    marker.title = event.error
      ? `Error: ${event.error} ${LANE_KIND_LABELS[event.kind]}`
      : `${label}: ${LANE_KIND_LABELS[event.kind]}`;
    marker.setAttribute("role", "img");
    marker.setAttribute("aria-label", marker.title);
    track.append(marker);
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

function getOverlayErrors(expected, actual, totalTicks) {
  const errors = [];
  for (const lane of ["scratch", "fader"]) {
    const isInLane = (event) =>
      lane === "scratch"
        ? ["forward", "backward", "stop"].includes(event.kind)
        : ["open", "closed"].includes(event.kind);
    const expectedLane = expected.filter(isInLane);
    const actualLane = actual.filter(isInLane);
    const table = Array.from(
      { length: expectedLane.length + 1 },
      () => new Array(actualLane.length + 1).fill(0),
    );
    for (let i = expectedLane.length - 1; i >= 0; i -= 1) {
      for (let j = actualLane.length - 1; j >= 0; j -= 1) {
        table[i][j] = expectedLane[i].kind === actualLane[j].kind
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
      }
    }
    const matchedExpected = new Set();
    const matchedActual = new Set();
    let i = 0;
    let j = 0;
    while (i < expectedLane.length && j < actualLane.length) {
      if (expectedLane[i].kind === actualLane[j].kind) {
        matchedExpected.add(i++);
        matchedActual.add(j++);
      } else if (table[i + 1][j] >= table[i][j + 1]) {
        i += 1;
      } else {
        j += 1;
      }
    }
    expectedLane.forEach((event, index) => {
      if (!matchedExpected.has(index)) {
        errors.push({
          kind: event.kind,
          position: event.position ??
            Math.min(100, Math.max(0, event.tick / totalTicks * 100)),
          error: "SAMPLE missing",
        });
      }
    });
    actualLane.forEach((event, index) => {
      if (!matchedActual.has(index)) {
        errors.push({
          kind: event.kind,
          position: event.position,
          error: "YOU extra",
        });
      }
    });
  }
  return errors;
}

function renderOverlayRows(
  container,
  expected,
  actual,
  errors,
  scoreData,
  progress = null,
) {
  for (
    const [source, events] of [
      ["sample", expected],
      ["you", actual],
      ["error", errors],
    ]
  ) {
    for (const lane of ["scratch", "fader"]) {
      const label = source === "sample"
        ? "SAMPLE"
        : source === "you"
        ? "YOU"
        : "Error";
      renderOverlayLane(
        container,
        `${label} · ${lane === "scratch" ? "スクラッチ" : "フェーダー"}`,
        lane,
        events,
        scoreData,
        source === "you" ? progress : null,
        source,
      );
    }
  }
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
      event.tick < playback.currentStep ||
      (event.kind === "stop" && (
        actualKinds.some((actual) =>
          actual.type === "scratch" && actual.direction === "stop"
        ) ||
        (playback.currentStep === 0 && playback.loopNumber > 2)
      ))
    );
    const expectedKinds = passedExpected.map((event) => ({
      type: event.kind === "open" || event.kind === "closed"
        ? "fader"
        : "scratch",
      ...(event.kind === "open" || event.kind === "closed"
        ? { state: event.kind }
        : { direction: event.kind }),
    }));
    const liveAnalysis = actualKinds.length
      ? analyzePerformance(expectedKinds, actualKinds)
      : null;
    const sampleEvents = expected.map((event) => ({
      ...event,
      position: event.tick / scoreData.totalTicks * 100,
    }));
    const errorEvents = getOverlayErrors(
      passedExpected,
      performedEvents,
      scoreData.totalTicks,
    );
    renderOverlayRows(
      container,
      sampleEvents,
      performedEvents,
      errorEvents,
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
  const sampleEvents = expected.map((event) => ({
    ...event,
    position: event.tick / scoreData.totalTicks * 100,
  }));
  let loopStart = 0;
  if (performance?.durationMs > 0) {
    loopStart = loops.length > 1 ? loops[loops.length - 2] : 0;
    const loopEnd = loops.at(-1);
    const loopDuration = Math.max(1, loopEnd - loopStart);
    for (const event of performance.events) {
      if ((loopStart > 0 && event.t <= loopStart) || event.t > loopEnd) {
        continue;
      }
      performedEvents.push({
        kind: event.type === "scratch" ? event.direction : event.state,
        position: Math.min(
          100,
          Math.max(0, (event.t - loopStart) / loopDuration * 100),
        ),
      });
    }
  }
  const errorEvents = getOverlayErrors(
    expected,
    analysis ? performedEvents : [],
    scoreData.totalTicks,
  );
  renderOverlayRows(
    container,
    sampleEvents,
    performedEvents,
    errorEvents,
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
