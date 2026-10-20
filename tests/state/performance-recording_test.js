import assert from "node:assert/strict";
import { chartCatalog } from "../../src/data/chart-catalog.js";
import { compileScoreData } from "../../src/domain/score-compiler.js";
import {
  assignMapping,
  createEmptyMapping,
  createEventCompressor,
  createStopDetector,
  getMidiSignature,
  routeMidiMessage,
} from "../../src/domain/midi-mapping.js";
import { analyzePerformance } from "../../src/domain/performance-analysis.js";
import { updatePlaybackCursor } from "../../src/domain/playback.js";
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

for (const boundary of ["bar", "loop"]) {
  Deno.test(`v1 regression: ${boundary} reset records a duplicate before the boundary`, () => {
    const app = createTestApp();
    const score = compileScoreData(chartCatalog[0]);
    const boundaryTick = boundary === "bar"
      ? score.ticksPerBar
      : score.totalTicks;
    const tickMs = score.tickDurationSeconds * 60000 / 80;
    const startedAt = 10_000;
    const boundaryAt = startedAt + boundaryTick * tickMs;
    const previousTickAt = boundaryAt - tickMs;
    const compressor = createEventCompressor();
    app.actions.setMidiState({ recordingMidi: true });
    const feed = (direction, time) => {
      const kept = compressor.accept({ type: "scratch", direction, time });
      if (kept) app.actions.recordMidiAction(kept);
    };
    feed("backward", previousTickAt + 10);
    feed("backward", previousTickAt + 20);
    assert.equal(app.state.midiActionRecord.length, 1);

    const cursor = updatePlaybackCursor(
      boundaryTick - 1,
      score.totalTicks,
      true,
    );
    assert.equal(cursor.shouldStop, false);
    // Historical v1 reproduction: advancePlayback used to reset before the clock.
    if (
      cursor.currentStep === 0 ||
      cursor.currentStep % score.ticksPerBar === 0
    ) compressor.reset();
    feed("backward", previousTickAt + 30);
    assert.equal(app.state.midiActionRecord.length, 2);
    assert.ok(app.state.midiActionRecord[1].time < boundaryAt);
    feed("forward", boundaryAt + 10);
    feed("stop", boundaryAt + 100);

    const performance = createPerformance(app.state.midiActionRecord, {
      startedAt,
      endedAt: boundaryAt + 100,
    });
    assert.deepEqual(
      performance.events.map((event) => event.direction),
      ["backward", "backward", "forward", "stop"],
    );
    const expected = ["backward", "forward", "stop"].map((direction) => ({
      type: "scratch",
      direction,
    }));
    const analysis = analyzePerformance(expected, performance.events);
    assert.equal(analysis.matched, 3);
    assert.equal(analysis.missing, 0);
    assert.equal(analysis.extra, 1);
    assert.equal(analysis.byKind.backward.extra, 1);
    assert.equal(analysis.accuracy, 75);
  });
}

for (const boundary of ["bar", "loop"]) {
  for (const source of ["mouse", "midi"]) {
    Deno.test(`v2 boundary: ${source} keeps physical state across ${boundary}`, () => {
      const app = createTestApp();
      const score = compileScoreData(chartCatalog[0]);
      const boundaryTick = boundary === "bar"
        ? score.ticksPerBar
        : score.totalTicks;
      const boundaryAt = 10_000 + boundaryTick * 100;
      const compressor = createEventCompressor();
      const mapping = createMapping();
      app.actions.setMidiState({ recordingMidi: true });
      const feed = (direction, time) => {
        const event = source === "midi"
          ? routeMidiMessage(
            direction === "forward" ? [0x90, 36, 100] : [0x90, 37, 90],
            { mapping, learnAction: null, time },
          ).event
          : { type: "scratch", direction, time };
        const kept = compressor.accept(event);
        if (kept) app.actions.recordMidiAction(kept);
      };
      const fader = { type: "fader", state: "closed", time: boundaryAt - 90 };
      app.actions.recordMidiAction(compressor.accept(fader));
      feed("backward", boundaryAt - 80);
      const before = compressor.getState();
      const cursor = updatePlaybackCursor(
        boundaryTick - 1,
        score.totalTicks,
        true,
      );
      assert.equal(cursor.currentStep, boundary === "bar" ? boundaryTick : 0);
      feed("backward", boundaryAt - 10);
      feed("backward", boundaryAt);
      feed("backward", boundaryAt + 10);
      assert.equal(compressor.accept({ ...fader, time: boundaryAt }), null);
      assert.deepEqual(compressor.getState(), before);
      assert.equal(app.state.midiActionRecord.length, 2);
      feed("forward", boundaryAt + 20);
      assert.equal(app.state.midiActionRecord.length, 3);
      assert.deepEqual(
        app.state.midiActionRecord.map((event) =>
          event.direction ?? event.state
        ),
        ["closed", "backward", "forward"],
      );
    });
  }
}
