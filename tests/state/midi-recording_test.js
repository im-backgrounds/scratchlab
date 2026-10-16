import assert from "node:assert/strict";
import { chartCatalog } from "../../src/data/chart-catalog.js";
import { compileScoreData } from "../../src/domain/score-compiler.js";
import {
  assignMapping,
  createEmptyMapping,
  getMidiSignature,
  routeMidiMessage,
} from "../../src/domain/midi-mapping.js";
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

// Mirrors the app's handler: events are recorded only while recording.
function feed(app, mapping, data, time) {
  const routed = routeMidiMessage(data, { mapping, learnAction: null, time });
  if (routed.kind === "event" && app.state.recordingMidi) {
    app.actions.recordMidiAction(routed.event);
  }
}

Deno.test("recording keeps timestamped scratch and fader events in order", () => {
  const app = createTestApp();
  let mapping = assignMapping(
    createEmptyMapping(),
    "forward",
    getMidiSignature([0x90, 36, 100]),
  );
  mapping = assignMapping(
    mapping,
    "fader-close",
    getMidiSignature([0x90, 41, 100]),
  );

  feed(app, mapping, [0x90, 36, 100], 1);
  assert.equal(app.state.midiActionRecord.length, 0);

  app.actions.setMidiState({ recordingMidi: true });
  feed(app, mapping, [0x90, 36, 100], 100);
  feed(app, mapping, [0x90, 41, 100], 250);
  feed(app, mapping, [0x90, 99, 100], 300);

  assert.deepEqual(app.state.midiActionRecord, [
    { type: "scratch", direction: "forward", time: 100 },
    { type: "fader", state: "closed", time: 250 },
  ]);
});

Deno.test("clearing the MIDI record also clears recorded actions", () => {
  const app = createTestApp();
  app.actions.recordMidiEvent({ status: 144, note: 1, velocity: 1, time: 1 });
  app.actions.recordMidiAction({ type: "fader", state: "open", time: 1 });
  app.actions.clearMidiRecord();
  assert.equal(app.state.midiRecord.length, 0);
  assert.equal(app.state.midiActionRecord.length, 0);
});

Deno.test("raw MIDI recording is unchanged by action recording", () => {
  const app = createTestApp();
  app.actions.recordMidiEvent({ status: 144, note: 1, velocity: 1, time: 1 });
  app.actions.recordMidiAction({ type: "fader", state: "open", time: 2 });
  assert.equal(app.state.midiRecord.length, 1);
  assert.equal(app.state.midiActionRecord.length, 1);
});
