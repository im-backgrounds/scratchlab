import assert from "node:assert/strict";
import {
  clearReplayStorage,
  getReplay,
  loadReplayStorage,
  REPLAY_STORAGE_KEY,
  saveReplay,
  saveReplayStorage,
} from "../../src/domain/replay-storage.js";
import { createStopObservation } from "../../src/domain/midi-mapping.js";
import {
  createLoopBoundary,
  createLoopState,
} from "../../src/domain/playback.js";

function backend() {
  const data = new Map();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

function record(chartId = "baby-scratch") {
  const boundary = (edge, time) =>
    createLoopBoundary({
      edge,
      time,
      sessionId: "replay",
      loopIndex: 1,
      phase: "recording",
      inputState: { currentDirection: "unknown", faderState: "open" },
    });
  const start = boundary("start", 1000);
  const end = boundary("end", 5000);
  return structuredClone({
    version: 1,
    chartId,
    eventModelVersion: 2,
    bpm: 80,
    recordedAt: 6000,
    replayContext: {
      recordingStartedAt: 1000,
      recordingLoopCount: 1,
      loopStates: [createLoopState(start, end)],
    },
    recordedTimeline: [
      start,
      { type: "scratch", direction: "forward", time: 1000 },
      { type: "scratch", direction: "backward", time: 2000 },
      { type: "fader", state: "closed", time: 2100 },
      { type: "fader", state: "open", time: 2200 },
      createStopObservation({
        source: "mouse",
        lastMovementAt: 2200,
        timeoutMs: 180,
      }),
      end,
    ],
  });
}

Deno.test("Replay save/load round-trip retains record, loops, Meaning Events, Stop and Boundary", () => {
  const storage = backend();
  const data = { version: 1, replays: { "baby-scratch": record() } };
  assert.deepEqual(saveReplayStorage(data, storage), { ok: true });
  assert.deepEqual(loadReplayStorage(storage), data);
});

Deno.test("Replay get retrieves a detached record and missing charts return null", () => {
  const storage = backend();
  saveReplay(record(), storage);
  const found = getReplay("baby-scratch", storage);
  assert.deepEqual(found, record());
  found.replayContext.loopStates[0].startTime = 0;
  found.recordedTimeline[1].time = 0;
  assert.deepEqual(getReplay("baby-scratch", storage), record());
  assert.equal(getReplay("absent", storage), null);
  assert.throws(() => getReplay("", storage), TypeError);
});

Deno.test("Replay charts save independently and one chart is explicitly replaced without scoring", () => {
  const storage = backend();
  saveReplay(record(), storage);
  saveReplay(record("chirp-scratch"), storage);
  const replacement = { ...record(), bpm: 95, recordedAt: 7000 };
  saveReplay(replacement, storage);
  assert.deepEqual(getReplay("baby-scratch", storage), replacement);
  assert.deepEqual(
    getReplay("chirp-scratch", storage),
    record("chirp-scratch"),
  );
});

Deno.test("Replay accepts the documented minimal loop shape and empty recorded timeline", () => {
  const storage = backend();
  const input = record();
  input.replayContext.loopStates = [{
    loopIndex: 1,
    startTime: 1000,
    endTime: 5000,
    phase: "recording",
  }];
  input.recordedTimeline = [];
  assert.deepEqual(saveReplay(input, storage), { ok: true });
  assert.deepEqual(getReplay(input.chartId, storage), input);
});

Deno.test("Replay retains demo and multiple recording loops with boundary-time events unchanged", () => {
  const storage = backend();
  const input = record();
  const first = input.replayContext.loopStates[0];
  input.replayContext.recordingLoopCount = 2;
  input.replayContext.loopStates = [
    { ...first, loopIndex: 0, phase: "demo", startTime: 0, endTime: 1000 },
    first,
    { ...first, loopIndex: 2, startTime: 5000, endTime: 9000 },
  ];
  input.recordedTimeline.push(
    { type: "scratch", direction: "forward", time: 5000 },
    { type: "fader", state: "closed", time: 5000 },
  );
  assert.deepEqual(saveReplay(input, storage), { ok: true });
  assert.deepEqual(getReplay(input.chartId, storage), input);
});

Deno.test("Replay rejects invalid records without overwriting existing data", () => {
  const storage = backend();
  saveReplay(record(), storage);
  const before = storage.getItem(REPLAY_STORAGE_KEY);
  const mutations = [
    (r) => {
      r.eventModelVersion = 1;
    },
    (r) => {
      r.version = 2;
    },
    (r) => {
      r.chartId = "";
    },
    (r) => {
      r.bpm = 0;
    },
    (r) => {
      r.recordedAt = NaN;
    },
    (r) => {
      delete r.recordedTimeline;
    },
    (r) => {
      delete r.replayContext.loopStates;
    },
    (r) => {
      r.replayContext.loopStates = [];
    },
    (r) => {
      r.replayContext.recordingLoopCount = 2;
    },
    (r) => {
      r.replayContext.recordingStartedAt = 999;
    },
    (r) => {
      r.replayContext.loopStates[0].endTime = 1000;
    },
    (r) => {
      r.replayContext.loopStates.push(r.replayContext.loopStates[0]);
    },
    (r) => {
      r.replayContext.loopStates[0].startDirection = "invalid";
    },
    (r) => {
      r.recordedTimeline.reverse();
    },
    (r) => {
      r.recordedTimeline[1].time = Infinity;
    },
    (r) => {
      r.recordedTimeline[1].direction = "stop";
    },
    (r) => {
      r.recordedTimeline[5].timeoutMs = 1;
    },
    (r) => {
      r.recordedTimeline[0].edge = "invalid";
    },
    (r) => {
      r.recordedTimeline[0] = null;
    },
  ];
  for (const mutate of mutations) {
    const candidate = record();
    mutate(candidate);
    assert.deepEqual(saveReplay(candidate, storage), {
      ok: false,
      reason: "invalid",
    });
    assert.equal(storage.getItem(REPLAY_STORAGE_KEY), before);
  }
  assert.deepEqual(
    saveReplayStorage({ version: 1, replays: { other: record() } }, storage),
    { ok: false, reason: "invalid" },
  );
});

Deno.test("Replay omits derived fields without mutating input", () => {
  const storage = backend();
  const input = record();
  input.accuracy = 100;
  input.timingAccuracy = 90;
  input.matching = { matched: 4 };
  input.timing = { measuredCount: 4 };
  input.overlay = { events: [] };
  input.replayContext.loopStates[0].position = 0.5;
  input.recordedTimeline[1].position = 0.25;
  const before = structuredClone(input);
  saveReplay(input, storage);
  assert.deepEqual(input, before);
  assert.deepEqual(getReplay(input.chartId, storage), record());
});

Deno.test("Replay corrupt JSON and invalid schema load empty, recover only on explicit save", () => {
  const storage = backend();
  const warn = console.warn;
  let warnings = 0;
  console.warn = () => warnings++;
  try {
    for (
      const corrupt of [
        "invalid json",
        "null",
        JSON.stringify({
          version: 1,
          replays: { "baby-scratch": { eventModelVersion: 1 } },
        }),
      ]
    ) {
      storage.setItem(REPLAY_STORAGE_KEY, corrupt);
      assert.deepEqual(loadReplayStorage(storage), { version: 1, replays: {} });
      assert.equal(storage.getItem(REPLAY_STORAGE_KEY), corrupt);
      assert.deepEqual(saveReplay(record(), storage), { ok: true });
      assert.deepEqual(getReplay("baby-scratch", storage), record());
    }
    assert.equal(warnings, 3);
  } finally {
    console.warn = warn;
  }
});

Deno.test("Replay clear touches only its own key and missing storage loads empty", () => {
  const storage = backend();
  assert.deepEqual(loadReplayStorage(storage), { version: 1, replays: {} });
  storage.setItem("scratchlab.ghost", "unchanged");
  saveReplay(record(), storage);
  assert.deepEqual(clearReplayStorage(storage), { ok: true });
  assert.deepEqual([...storage.data], [["scratchlab.ghost", "unchanged"]]);
});

Deno.test("Replay future storage versions are protected from save and clear", () => {
  const storage = backend();
  const future = JSON.stringify({ version: 2, replays: {} });
  storage.setItem(REPLAY_STORAGE_KEY, future);
  for (
    const result of [
      saveReplay(record(), storage),
      saveReplayStorage({ version: 1, replays: {} }, storage),
      clearReplayStorage(storage),
    ]
  ) assert.deepEqual(result, { ok: false, reason: "future-version" });
  assert.equal(storage.getItem(REPLAY_STORAGE_KEY), future);
});

Deno.test("Replay read denial returns empty and warns; write failures are explicit", () => {
  const storage = backend();
  const warn = console.warn;
  let warnings = 0;
  console.warn = () => warnings++;
  try {
    storage.getItem = () => {
      throw new Error("denied");
    };
    assert.deepEqual(loadReplayStorage(storage), { version: 1, replays: {} });
    assert.equal(warnings, 1);
    assert.deepEqual(saveReplay(record(), storage), {
      ok: false,
      reason: "unavailable",
    });
    assert.deepEqual(clearReplayStorage(null), {
      ok: false,
      reason: "unavailable",
    });
  } finally {
    console.warn = warn;
  }
  const full = backend();
  saveReplay(record(), full);
  const before = full.getItem(REPLAY_STORAGE_KEY);
  full.setItem = () => {
    throw new Error("quota");
  };
  full.removeItem = () => {
    throw new Error("denied");
  };
  assert.deepEqual(saveReplay(record("chirp-scratch"), full), {
    ok: false,
    reason: "write-failed",
  });
  assert.deepEqual(clearReplayStorage(full), {
    ok: false,
    reason: "write-failed",
  });
  assert.equal(full.getItem(REPLAY_STORAGE_KEY), before);
});

Deno.test("Replay map safely supports prototype-like chart identifiers", () => {
  const storage = backend();
  for (const id of ["__proto__", "toString"]) {
    assert.deepEqual(saveReplay(record(id), storage), { ok: true });
    assert.deepEqual(getReplay(id, storage), record(id));
  }
  assert.equal(Object.keys(loadReplayStorage(storage).replays).length, 2);
});
