import assert from "node:assert/strict";
import { createGhostSelection } from "../../src/features/ghost-integration.js";
import {
  GHOST_STORAGE_KEY,
  updateBestRun,
} from "../../src/domain/ghost-storage.js";
import { compileScoreData } from "../../src/domain/score-compiler.js";

function fixture() {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
  const record = (chartId, accuracy = 95) => ({
    chartId,
    eventModelVersion: 2,
    bpm: 80,
    accuracy,
    timingAccuracy: null,
    recordedAt: 1760000000000,
    recordedTimeline: [
      { type: "scratch", direction: "forward", time: 1000 },
      { type: "fader", state: "closed", time: 1100 },
    ],
  });
  updateBestRun(record("baby-scratch"), storage);
  updateBestRun(record("chirp-scratch", 97), storage);
  const selection = createGhostSelection(storage);
  return { data, storage, record, selection };
}

Deno.test("Ghost enable state defaults to false for every runtime instance", () => {
  const { selection, storage } = fixture();
  assert.equal(selection.enabled, false);
  assert.equal(selection.isGhostEnabled(), false);
  selection.enableGhost();
  const fresh = createGhostSelection(storage);
  assert.equal(fresh.enabled, false);
  assert.equal(fresh.isGhostEnabled(), false);
});

Deno.test("Ghost toggle changes false to true and true to false", () => {
  const { selection } = fixture();
  selection.toggleGhost();
  assert.equal(selection.enabled, true);
  assert.equal(selection.isGhostEnabled(), true);
  selection.toggleGhost();
  assert.equal(selection.enabled, false);
  assert.equal(selection.isGhostEnabled(), false);
});

Deno.test("Ghost enable and disable are idempotent", () => {
  const { selection } = fixture();
  for (let i = 0; i < 2; i++) {
    selection.enableGhost();
    assert.equal(selection.enabled, true);
    assert.equal(selection.isGhostEnabled(), true);
  }
  for (let i = 0; i < 2; i++) {
    selection.disableGhost();
    assert.equal(selection.enabled, false);
    assert.equal(selection.isGhostEnabled(), false);
  }
});

Deno.test("chart changes update Ghost data while preserving either enable state", () => {
  const { selection } = fixture();
  for (const enabled of [false, true]) {
    if (enabled) selection.enableGhost();
    for (const chartId of ["baby-scratch", "chirp-scratch", "baby-scratch"]) {
      selection.selectChart(chartId);
      assert.equal(selection.selectedGhost.chartId, chartId);
      assert.equal(selection.enabled, enabled);
      assert.equal(selection.isGhostEnabled(), enabled);
    }
  }
});

Deno.test("Ghost controls work without a Ghost and missing data preserves enable state", () => {
  const { selection } = fixture();
  assert.equal(selection.selectedGhost, null);
  selection.enableGhost();
  assert.equal(selection.isGhostEnabled(), true);
  selection.selectChart("baby-scratch");
  selection.selectChart("absent");
  assert.equal(selection.selectedGhost, null);
  assert.equal(selection.isGhostEnabled(), true);
  selection.toggleGhost();
  assert.equal(selection.isGhostEnabled(), false);
  selection.toggleGhost();
  assert.equal(selection.isGhostEnabled(), true);
  selection.disableGhost();
  assert.equal(selection.isGhostEnabled(), false);
});

Deno.test("Ghost controls do not access storage or change selected Ghost data", () => {
  const { selection, storage } = fixture();
  const selected = selection.selectChart("baby-scratch");
  const snapshot = structuredClone(selected);
  storage.getItem = storage.setItem = () => {
    throw new Error("Ghost enable state must not access storage");
  };
  selection.enableGhost();
  selection.disableGhost();
  selection.toggleGhost();
  assert.equal(selection.isGhostEnabled(), true);
  assert.equal(selection.selectedGhost, selected);
  assert.deepEqual(selection.selectedGhost, snapshot);
});

Deno.test("Ghost retrieval starts null and loads chart A into the exact runtime shape", () => {
  const { selection, record } = fixture();
  assert.equal(selection.selectedGhost, null);
  const selected = selection.selectChart("baby-scratch");
  assert.equal(selection.selectedGhost, selected);
  assert.deepEqual(selected, {
    chartId: "baby-scratch",
    accuracy: 95,
    timingAccuracy: null,
    recordedTimeline: record("baby-scratch").recordedTimeline,
  });
});

Deno.test("Ghost retrieval clears chart A when chart B has no Best Run", () => {
  const { selection } = fixture();
  selection.selectChart("baby-scratch");
  assert.equal(selection.selectChart("one-click-flare-orbit"), null);
  assert.equal(selection.selectedGhost, null);
});

Deno.test("Ghost retrieval switches A to B and back without stale score or timeline", () => {
  const { selection } = fixture();
  const a = selection.selectChart("baby-scratch");
  const b = selection.selectChart("chirp-scratch");
  assert.equal(b.chartId, "chirp-scratch");
  assert.equal(b.accuracy, 97);
  assert.notEqual(b.recordedTimeline, a.recordedTimeline);
  assert.deepEqual(selection.selectChart("baby-scratch"), a);
});

Deno.test("Ghost retrieval is read-only and runtime edits cannot mutate saved records", () => {
  const { selection, data, storage } = fixture();
  const before = storage.getItem(GHOST_STORAGE_KEY);
  selection.selectChart("baby-scratch").recordedTimeline[0].time = 999;
  assert.equal(
    selection.selectChart("baby-scratch").recordedTimeline[0].time,
    1000,
  );
  selection.selectChart("chirp-scratch");
  selection.selectChart("absent");
  assert.equal(storage.getItem(GHOST_STORAGE_KEY), before);
  assert.equal(data.size, 1);
});

Deno.test("Ghost retrieval rereads storage on selection to obtain an updated Best Run", () => {
  const { selection, storage, record } = fixture();
  selection.selectChart("baby-scratch");
  updateBestRun(record("baby-scratch", 99), storage);
  assert.equal(selection.selectChart("baby-scratch").accuracy, 99);
});

Deno.test("corrupt or incompatible Ghost resets a previously selected Ghost to null", () => {
  const { selection, data, storage } = fixture();
  const original = storage.getItem(GHOST_STORAGE_KEY);
  const warn = console.warn;
  const warnings = [];
  console.warn = (message) => warnings.push(message);
  try {
    for (
      const text of [
        "invalid json",
        JSON.stringify({ version: 2, bestRuns: {} }),
        JSON.stringify({
          version: 1,
          bestRuns: { "baby-scratch": { eventModelVersion: 1 } },
        }),
      ]
    ) {
      data.set(GHOST_STORAGE_KEY, original);
      selection.selectChart("baby-scratch");
      data.set(GHOST_STORAGE_KEY, text);
      assert.equal(selection.selectChart("baby-scratch"), null);
      assert.equal(selection.selectedGhost, null);
      assert.equal(data.get(GHOST_STORAGE_KEY), text);
    }
    assert.equal(warnings.length, 3);
  } finally {
    console.warn = warn;
  }
});

Deno.test("Ghost retrieval handles storage denial without retaining another chart's Ghost", () => {
  const { selection, storage } = fixture();
  selection.selectChart("baby-scratch");
  storage.getItem = () => {
    throw new Error("denied");
  };
  const warn = console.warn;
  const warnings = [];
  console.warn = (message) => warnings.push(message);
  try {
    assert.equal(selection.selectChart("chirp-scratch"), null);
    assert.equal(selection.selectedGhost, null);
    assert.equal(warnings.length, 1);
  } finally {
    console.warn = warn;
  }
});

function captureFixture() {
  const setup = fixture();
  const chart = {
    id: "baby-scratch",
    scoreData: compileScoreData({
      name: "Ghost",
      beat: "4/4",
      score: [["F", "B"]],
    }),
  };
  const analysis = {
    recordedTimeline: setup.record(chart.id).recordedTimeline,
    matching: { accuracy: 95 },
    timing: { timingAccuracy: null },
    bpm: 80,
    loops: [{
      sessionId: "ghost",
      phase: "recording",
      loopIndex: 1,
      startTime: 1000,
      endTime: 4000,
    }],
  };
  return { ...setup, chart, analysis };
}

Deno.test("Ghost rendering context stays in memory and works while enabled is false", () => {
  const { selection, chart, analysis, data } = captureFixture();
  const before = JSON.stringify([...data]);
  selection.captureBestRunContext(chart, analysis);
  assert.equal(selection.enabled, false);
  assert.deepEqual(
    selection.getOverlayData(chart).events.map((event) => event.timeMs),
    [0, 100],
  );
  assert.equal(JSON.stringify([...data]), before);
  analysis.loops[0].startTime = 0;
  assert.equal(selection.getOverlayData(chart).events[0].timeMs, 0);
});

Deno.test("Ghost rendering context survives chart changes but not a new session", () => {
  const { selection, chart, analysis, storage } = captureFixture();
  selection.captureBestRunContext(chart, analysis);
  selection.selectChart("chirp-scratch");
  assert.equal(selection.getOverlayData(chart), null);
  selection.selectChart(chart.id);
  assert.equal(selection.getOverlayData(chart).events.length, 2);
  const fresh = createGhostSelection(storage);
  fresh.selectChart(chart.id);
  assert.equal(fresh.getOverlayData(chart), null);
});

Deno.test("Ghost rendering never reuses context for another record or score revision", () => {
  const { selection, chart, analysis, record, storage } = captureFixture();
  selection.captureBestRunContext(chart, analysis);
  assert.equal(
    selection.getOverlayData({ ...chart, scoreData: { ...chart.scoreData } }),
    null,
  );
  updateBestRun(record(chart.id, 99), storage);
  selection.selectChart(chart.id);
  assert.equal(selection.getOverlayData(chart), null);
});
