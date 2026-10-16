import assert from "node:assert/strict";
import { chartCatalog } from "../../src/data/chart-catalog.js";
import { compileScoreData } from "../../src/domain/score-compiler.js";
import {
  assignMapping,
  createEmptyMapping,
  createStopDetector,
  getMidiSignature,
  routeMidiMessage,
} from "../../src/domain/midi-mapping.js";
import {
  createPerformance,
  createPerformanceRepository,
  normalizePerformance,
} from "../../src/domain/performance.js";
import { createActions } from "../../src/state/actions.js";
import { createInitialState, createStore } from "../../src/state/store.js";

function createTestApp() {
  const catalog = chartCatalog.map((chart) => {
    const scoreData = compileScoreData({
      name: chart.name,
      difficulty: chart.difficulty,
      beat: chart.beat,
      score: chart.score,
    });
    return { ...chart, scoreData, steps: scoreData.steps };
  });
  const store = createStore(createInitialState(catalog));
  return { state: store.getState(), actions: createActions(store) };
}

function createFakeStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

function createMapping() {
  let mapping = assignMapping(
    createEmptyMapping(),
    "forward",
    getMidiSignature([0x90, 36, 100]),
  );
  mapping = assignMapping(
    mapping,
    "backward",
    getMidiSignature([0x90, 37, 90]),
  );
  return assignMapping(mapping, "fader", getMidiSignature([0xb0, 7, 60]));
}

Deno.test("a recorded MIDI session becomes a persisted performance", () => {
  const app = createTestApp();
  const mapping = createMapping();
  const startedAt = 10_000;

  let fireStop;
  const detector = createStopDetector({
    onStop: (event) => app.actions.recordMidiAction(event),
    timeoutMs: 150,
    setTimer: (fn) => (fireStop = fn),
    clearTimer: () => {},
  });
  const feed = (data, time) => {
    const routed = routeMidiMessage(data, { mapping, learnAction: null, time });
    if (routed.kind !== "event" || !app.state.recordingMidi) return;
    app.actions.recordMidiAction(routed.event);
    detector.observe(routed.event);
  };

  feed([0x90, 36, 100], startedAt + 5);
  assert.equal(app.state.midiActionRecord.length, 0);

  app.actions.setMidiState({ recordingMidi: true });
  feed([0xb0, 7, 10], startedAt + 100);
  feed([0x90, 36, 100], startedAt + 200);
  feed([0x90, 37, 90], startedAt + 400);
  feed([0xb0, 7, 125], startedAt + 500);
  fireStop();

  const performance = createPerformance(app.state.midiActionRecord, {
    startedAt,
    endedAt: startedAt + 1000,
  });
  assert.deepEqual(performance.counts, {
    forward: 1,
    backward: 1,
    stop: 1,
    faderOpen: 1,
    faderClosed: 1,
  });
  assert.deepEqual(performance.events.map((event) => event.t), [
    100,
    200,
    400,
    500,
    550,
  ]);
  assert.equal(performance.durationMs, 1000);

  const storage = createFakeStorage();
  createPerformanceRepository(storage).save(performance);
  assert.deepEqual(
    createPerformanceRepository(storage).load(),
    normalizePerformance(performance),
  );
});

Deno.test("clearing the MIDI record does not change a finished performance", () => {
  const app = createTestApp();
  app.actions.recordMidiAction({ type: "fader", state: "open", time: 150 });
  const performance = createPerformance(app.state.midiActionRecord, {
    startedAt: 100,
    endedAt: 400,
  });
  app.actions.clearMidiRecord();
  assert.equal(app.state.midiActionRecord.length, 0);
  assert.equal(performance.events.length, 1);
  assert.equal(performance.events[0].t, 50);
});
