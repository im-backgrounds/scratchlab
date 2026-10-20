import assert from "node:assert/strict";
import {
  clearGhostStorage,
  getBestRun,
  GHOST_STORAGE_KEY,
  loadGhostStorage,
  saveGhostStorage,
  updateBestRun,
} from "../../src/domain/ghost-storage.js";

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  const writes = [];
  return {
    data,
    writes,
    getItem: (key) => data.get(key) ?? null,
    setItem(key, value) {
      writes.push(key);
      data.set(key, value);
    },
    removeItem: (key) => data.delete(key),
  };
}

function record(overrides = {}) {
  return {
    chartId: "baby-scratch",
    eventModelVersion: 2,
    bpm: 80,
    accuracy: 95,
    timingAccuracy: 80,
    recordedAt: 1760000000000,
    recordedTimeline: [
      { type: "scratch", direction: "forward", time: 1280 },
      { type: "fader", state: "closed", time: 1360 },
      { type: "fader", state: "open", time: 1360 },
      { type: "scratch", direction: "backward", time: 1480 },
    ],
    ...overrides,
  };
}

const store = (run) => ({ version: 1, bestRuns: { [run.chartId]: run } });

Deno.test("Ghost save/load preserves the exact schema and event order", () => {
  const storage = fakeStorage();
  const data = store(record());
  assert.deepEqual(saveGhostStorage(data, storage), { ok: true });
  assert.deepEqual(loadGhostStorage(storage), data);
  assert.deepEqual(JSON.parse(storage.data.get(GHOST_STORAGE_KEY)), data);
  assert.deepEqual(storage.writes, ["scratchlab.ghost"]);
});

Deno.test("Ghost getBestRun returns a detached record or null", () => {
  const storage = fakeStorage();
  assert.equal(getBestRun("baby-scratch", storage), null);
  updateBestRun(record(), storage);
  const best = getBestRun("baby-scratch", storage);
  assert.deepEqual(best, record());
  best.recordedTimeline[0].direction = "backward";
  assert.deepEqual(getBestRun("baby-scratch", storage), record());
  assert.equal(getBestRun("chirp-scratch", storage), null);
  assert.equal(getBestRun("toString", storage), null);
  assert.throws(() => getBestRun("", storage), TypeError);
});

Deno.test("Ghost higher Accuracy replaces 95 with 97 regardless of Timing or age", () => {
  const storage = fakeStorage();
  updateBestRun(record(), storage);
  const candidate = record({ accuracy: 97, timingAccuracy: 0, recordedAt: 1 });
  assert.deepEqual(updateBestRun(candidate, storage), {
    ok: true,
    updated: true,
  });
  assert.deepEqual(getBestRun(candidate.chartId, storage), candidate);
});

Deno.test("Ghost equal Accuracy prefers higher Timing Accuracy", () => {
  const storage = fakeStorage();
  updateBestRun(record({ accuracy: 100, timingAccuracy: 80 }), storage);
  const candidate = record({
    accuracy: 100,
    timingAccuracy: 85,
    recordedAt: 1,
  });
  assert.deepEqual(updateBestRun(candidate, storage), {
    ok: true,
    updated: true,
  });
  assert.deepEqual(getBestRun(candidate.chartId, storage), candidate);
});

Deno.test("Ghost equal scores prefer newer recordedAt", () => {
  const storage = fakeStorage();
  const first = record({ accuracy: 100, timingAccuracy: 85 });
  updateBestRun(first, storage);
  const next = { ...first, recordedAt: first.recordedAt + 1 };
  assert.deepEqual(updateBestRun(next, storage), { ok: true, updated: true });
  assert.deepEqual(getBestRun(next.chartId, storage), next);
});

Deno.test("Ghost lower or exactly tied candidates do not write", () => {
  for (
    const changes of [
      { accuracy: 94, timingAccuracy: 100 },
      { timingAccuracy: 79 },
      { recordedAt: 1 },
      {},
    ]
  ) {
    const storage = fakeStorage();
    updateBestRun(record(), storage);
    assert.deepEqual(updateBestRun(record(changes), storage), {
      ok: true,
      updated: false,
    });
    assert.equal(storage.writes.length, 1);
    assert.deepEqual(getBestRun("baby-scratch", storage), record());
  }
});

Deno.test("Ghost null Timing is valid and ranks below any number including zero", () => {
  const storage = fakeStorage();
  updateBestRun(record({ timingAccuracy: null }), storage);
  assert.equal(getBestRun("baby-scratch", storage).timingAccuracy, null);
  assert.equal(
    updateBestRun(record({ timingAccuracy: 0 }), storage).updated,
    true,
  );
  assert.equal(
    updateBestRun(
      record({ timingAccuracy: null, recordedAt: 1760000000001 }),
      storage,
    ).updated,
    false,
  );
  assert.equal(
    updateBestRun(record({ accuracy: 96, timingAccuracy: null }), storage)
      .updated,
    true,
  );
  assert.equal(
    updateBestRun(
      record({ accuracy: 96, timingAccuracy: null, recordedAt: 1760000000001 }),
      storage,
    ).updated,
    true,
  );
});

Deno.test("Ghost stores one independent Best Run per chart, not per BPM", () => {
  const storage = fakeStorage();
  for (
    const chartId of [
      "baby-scratch",
      "chirp-scratch",
      "one-click-flare-orbit",
      "__proto__",
    ]
  ) {
    assert.equal(updateBestRun(record({ chartId }), storage).updated, true);
  }
  updateBestRun(record({ accuracy: 97, bpm: 60 }), storage);
  const data = loadGhostStorage(storage);
  assert.equal(Object.keys(data.bestRuns).length, 4);
  assert.equal(data.bestRuns["baby-scratch"].bpm, 60);
  assert.equal(data.bestRuns["chirp-scratch"].accuracy, 95);
  assert.equal(getBestRun("__proto__", storage).chartId, "__proto__");
});

Deno.test("Ghost persists only the approved fields and Meaning Events without mutating input", () => {
  const storage = fakeStorage();
  const run = record({
    expectedTimeline: [],
    matching: { missing: 5 },
    timingSamples: [],
    overlay: {},
    missing: 5,
    extra: 2,
  });
  run.recordedTimeline.splice(1, 0, {
    type: "stop",
    reason: "inactivity",
    source: "mouse",
    time: 1300,
  }, { type: "loop-boundary", time: 1300 });
  run.recordedTimeline[0].timingSample = 123;
  const before = structuredClone(run);
  assert.equal(updateBestRun(run, storage).ok, true);
  assert.deepEqual(getBestRun(run.chartId, storage), record());
  assert.deepEqual(run, before);
});

Deno.test("Ghost corrupt JSON and invalid documents load empty without changing stored bytes", () => {
  const warn = console.warn;
  const warnings = [];
  console.warn = (message) => warnings.push(message);
  try {
    for (
      const text of [
        "invalid json",
        "null",
        "[]",
        "{}",
        JSON.stringify({ version: 1, bestRuns: [] }),
        JSON.stringify(store(record({ eventModelVersion: 1 }))),
        JSON.stringify({ version: 1, bestRuns: { other: record() } }),
      ]
    ) {
      const storage = fakeStorage({ [GHOST_STORAGE_KEY]: text });
      assert.deepEqual(loadGhostStorage(storage), { version: 1, bestRuns: {} });
      assert.equal(getBestRun("baby-scratch", storage), null);
      assert.equal(storage.data.get(GHOST_STORAGE_KEY), text);
      assert.equal(storage.writes.length, 0);
    }
    assert.equal(warnings.length, 14);
  } finally {
    console.warn = warn;
  }
});

Deno.test("Ghost rejects non-v2 records on update and whole-store save", () => {
  const storage = fakeStorage();
  updateBestRun(record(), storage);
  const before = storage.data.get(GHOST_STORAGE_KEY);
  for (const eventModelVersion of [1, 3, "2", null, undefined]) {
    const candidate = record({ eventModelVersion });
    assert.deepEqual(updateBestRun(candidate, storage), {
      ok: false,
      reason: "invalid",
    });
    assert.deepEqual(saveGhostStorage(store(candidate), storage), {
      ok: false,
      reason: "invalid",
    });
    assert.equal(storage.data.get(GHOST_STORAGE_KEY), before);
  }
});

Deno.test("Ghost rejects invalid metrics, timestamps and timelines instead of silently fixing them", () => {
  const storage = fakeStorage();
  for (
    const changes of [
      { chartId: " " },
      { bpm: 0 },
      { bpm: Infinity },
      { accuracy: -1 },
      { accuracy: 101 },
      { accuracy: "95" },
      { timingAccuracy: NaN },
      { timingAccuracy: 101 },
      { recordedAt: -1 },
      { recordedAt: "2026-10-21" },
      { recordedTimeline: null },
      { recordedTimeline: [{ type: "scratch", direction: "stop", time: 1 }] },
      { recordedTimeline: [{ type: "fader", state: "unknown", time: 1 }] },
      {
        recordedTimeline: [{
          type: "scratch",
          direction: "forward",
          time: NaN,
        }],
      },
      {
        recordedTimeline: [{ type: "scratch", direction: "forward", time: -1 }],
      },
      {
        recordedTimeline: [
          record().recordedTimeline[3],
          record().recordedTimeline[0],
        ],
      },
      { recordedTimeline: [null] },
    ]
  ) {
    assert.deepEqual(updateBestRun(record(changes), storage), {
      ok: false,
      reason: "invalid",
    });
  }
  assert.equal(storage.writes.length, 0);
});

Deno.test("Ghost clear removes only the Ghost key and missing data reads empty", () => {
  const storage = fakeStorage({ "scratchlab.performance": "unchanged" });
  updateBestRun(record(), storage);
  assert.deepEqual(clearGhostStorage(storage), { ok: true });
  assert.deepEqual(loadGhostStorage(storage), { version: 1, bestRuns: {} });
  assert.equal(storage.data.get("scratchlab.performance"), "unchanged");
  assert.deepEqual(clearGhostStorage(storage), { ok: true });
});

Deno.test("Ghost protects future store versions from save, update and clear", () => {
  const text = JSON.stringify({ version: 2, bestRuns: {} });
  const storage = fakeStorage({ [GHOST_STORAGE_KEY]: text });
  for (
    const result of [
      saveGhostStorage(store(record()), storage),
      updateBestRun(record(), storage),
      clearGhostStorage(storage),
    ]
  ) assert.deepEqual(result, { ok: false, reason: "future-version" });
  assert.equal(storage.data.get(GHOST_STORAGE_KEY), text);
});

Deno.test("Ghost invalid whole-store save leaves all existing records unchanged", () => {
  const storage = fakeStorage();
  updateBestRun(record(), storage);
  const before = storage.data.get(GHOST_STORAGE_KEY);
  for (
    const data of [
      null,
      [],
      { version: 2, bestRuns: {} },
      { version: 1, bestRuns: [] },
      { version: 1, bestRuns: { other: record() } },
      {
        version: 1,
        bestRuns: { valid: record({ chartId: "valid" }), invalid: {} },
      },
    ]
  ) {
    assert.deepEqual(saveGhostStorage(data, storage), {
      ok: false,
      reason: "invalid",
    });
    assert.equal(storage.data.get(GHOST_STORAGE_KEY), before);
  }
});

Deno.test("Ghost corrupt data can be replaced only by an explicit valid save or update", () => {
  for (
    const save of [
      (storage) => saveGhostStorage(store(record()), storage),
      (storage) => updateBestRun(record(), storage),
    ]
  ) {
    const storage = fakeStorage({ [GHOST_STORAGE_KEY]: "invalid json" });
    assert.equal(save(storage).ok, true);
    assert.deepEqual(getBestRun("baby-scratch", storage), record());
  }
});

Deno.test("Ghost inaccessible reads return empty and warn without throwing", () => {
  const warn = console.warn;
  const warnings = [];
  console.warn = (message) => warnings.push(message);
  try {
    const storage = {
      getItem() {
        throw new Error("denied");
      },
    };
    assert.deepEqual(loadGhostStorage(storage), { version: 1, bestRuns: {} });
    assert.deepEqual(loadGhostStorage(null), { version: 1, bestRuns: {} });
    assert.equal(getBestRun("baby-scratch", storage), null);
    assert.equal(warnings.length, 3);
    assert.ok(warnings.every((message) => message.includes("unavailable")));
  } finally {
    console.warn = warn;
  }
});

Deno.test("Ghost storage access failures are explicit and never report a saved update", () => {
  for (
    const storage of [
      null,
      {
        getItem() {
          throw new Error("denied");
        },
      },
    ]
  ) {
    assert.deepEqual(saveGhostStorage(store(record()), storage), {
      ok: false,
      reason: "unavailable",
    });
    assert.deepEqual(updateBestRun(record(), storage), {
      ok: false,
      reason: "unavailable",
    });
    assert.deepEqual(clearGhostStorage(storage), {
      ok: false,
      reason: "unavailable",
    });
  }
  const storage = fakeStorage();
  updateBestRun(record(), storage);
  const before = storage.data.get(GHOST_STORAGE_KEY);
  storage.setItem = () => {
    throw new Error("quota");
  };
  assert.deepEqual(updateBestRun(record({ accuracy: 100 }), storage), {
    ok: false,
    reason: "write-failed",
  });
  assert.deepEqual(getBestRun("baby-scratch", storage), record());
  assert.equal(storage.data.get(GHOST_STORAGE_KEY), before);
  storage.removeItem = () => {
    throw new Error("denied");
  };
  assert.deepEqual(clearGhostStorage(storage), {
    ok: false,
    reason: "write-failed",
  });
});
