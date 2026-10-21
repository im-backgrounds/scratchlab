import assert from "node:assert/strict";
import { createMidiSimulator } from "./midi-simulator.js";

function fixture() {
  let time = 0;
  const pending = [];
  const midi = createMidiSimulator({
    now: () => time,
    schedule: (callback, delay) => {
      pending.push({ callback, at: time + delay });
    },
  });
  return {
    midi,
    advance(to) {
      pending.sort((a, b) => a.at - b.at);
      while (pending.length && pending[0].at <= to) {
        const next = pending.shift();
        time = next.at;
        next.callback();
      }
      time = to;
    },
  };
}

Deno.test("MIDI simulator exposes one connected input and no hardware outputs", async () => {
  const { midi } = fixture();
  const access = await midi.requestMIDIAccess();
  assert.equal(access, await midi.requestMIDIAccess());
  assert.equal(access.inputs.size, 1);
  assert.equal(access.outputs.size, 0);
  const input = [...access.inputs.values()][0];
  assert.equal(input.state, "connected");
  assert.equal(input.type, "input");
});

Deno.test("MIDI simulator schedules ordered messages and copies their bytes", () => {
  const { midi, advance } = fixture();
  const received = [];
  const input = [...midi.access.inputs.values()][0];
  input.onmidimessage = (event) => {
    received.push([event.timeStamp, [...event.data], event.receivedTime]);
  };
  const data = [144, 60, 127];
  midi.send({ timestamp: 1000, data });
  data[1] = 99;
  midi.sendMany([
    { timestamp: 1100, data: [128, 60, 0] },
    { timestamp: 1100, data: [176, 7, 0] },
  ]);
  advance(999);
  assert.deepEqual(received, []);
  advance(1000);
  assert.deepEqual(received, [[1000, [144, 60, 127], 1000]]);
  advance(1100);
  assert.deepEqual(received.slice(1), [
    [1100, [128, 60, 0], 1100],
    [1100, [176, 7, 0], 1100],
  ]);
});

Deno.test("MIDI simulator replaces onmidimessage without losing event listeners", () => {
  const { midi } = fixture();
  const input = [...midi.access.inputs.values()][0];
  let old = 0;
  let current = 0;
  let listener = 0;
  input.onmidimessage = () => old++;
  input.onmidimessage = () => current++;
  input.addEventListener("midimessage", () => listener++);
  midi.send({ timestamp: 0, data: [144, 60, 127] });
  input.onmidimessage = null;
  midi.send({ timestamp: 0, data: [128, 60, 0] });
  assert.deepEqual([old, current, listener], [0, 1, 2]);
});

Deno.test("MIDI simulator rejects invalid batches before delivering any input", () => {
  const { midi, advance } = fixture();
  const received = [];
  [...midi.access.inputs.values()][0].onmidimessage = (event) =>
    received.push(event);
  for (const timestamp of [-1, NaN, Infinity]) {
    assert.throws(
      () => midi.send({ timestamp, data: [144, 60, 127] }),
      RangeError,
    );
  }
  for (const data of [[144, 60], [144, 60, 128], [0, 60, 1], [144, 1.5, 1]]) {
    assert.throws(() => midi.send({ timestamp: 0, data }), TypeError);
  }
  assert.throws(() =>
    midi.sendMany([
      { timestamp: 100, data: [144, 60, 127] },
      { timestamp: 99, data: [128, 60, 0] },
    ]), RangeError);
  assert.throws(() =>
    midi.sendMany([
      { timestamp: 100, data: [144, 60, 127] },
      { timestamp: 200, data: [144, 60, -1] },
    ]), TypeError);
  advance(1000);
  assert.deepEqual(received, []);
});
