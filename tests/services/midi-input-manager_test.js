import assert from "node:assert/strict";
import {
  ALL_MIDI_INPUTS,
  createMidiInputManager,
  MIDI_INPUT_PREFERENCE_KEY,
} from "../../src/services/midi/input-manager.js";

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

function createInput(id, name = id, state = "connected") {
  return {
    id,
    name,
    manufacturer: "ScratchLab",
    state,
    onmidimessage: null,
  };
}

function createAccess(inputs) {
  const ports = new Map(inputs.map((input) => [input.id, input]));
  return {
    inputs: {
      values: () => ports.values(),
      get: (id) => ports.get(id),
      set: (input) => ports.set(input.id, input),
      delete: (id) => ports.delete(id),
    },
    onstatechange: null,
  };
}

Deno.test("the manager discovers devices and routes all inputs by default", async () => {
  const first = createInput("one", "Controller One");
  const second = createInput("two", "Controller Two");
  const access = createAccess([first, second]);
  const messages = [];
  const changes = [];
  const manager = createMidiInputManager({
    requestAccess: () => Promise.resolve(access),
    onMidiMessage: (data, input) => messages.push([data, input.id]),
    onChange: (state) => changes.push(state),
  });

  assert.equal(manager.snapshot().connected, false);
  const connected = await manager.connect();
  assert.equal(connected.connected, true);
  assert.deepEqual(
    connected.inputs.map(({ id, name, state }) => ({ id, name, state })),
    [
      { id: "one", name: "Controller One", state: "connected" },
      { id: "two", name: "Controller Two", state: "connected" },
    ],
  );
  const data = [0xb0, 21, 127];
  first.onmidimessage({ data });
  second.onmidimessage({ data });
  assert.deepEqual(messages, [[data, "one"], [data, "two"]]);
  assert.equal(changes.length, 1);
});

Deno.test("selecting an input persists and restricts routed messages", async () => {
  const storage = createStorage();
  const first = createInput("one");
  const second = createInput("two");
  const access = createAccess([first, second]);
  const messages = [];
  const manager = createMidiInputManager({
    requestAccess: () => Promise.resolve(access),
    storage,
    onMidiMessage: (_data, input) => messages.push(input.id),
  });

  await manager.connect();
  const selection = manager.selectInput("two");
  assert.equal(selection.preferenceSaved, true);
  assert.equal(storage.getItem(MIDI_INPUT_PREFERENCE_KEY), "two");
  assert.equal(first.onmidimessage, null);
  second.onmidimessage({ data: [0x90, 36, 100] });
  assert.deepEqual(messages, ["two"]);
});

Deno.test("the saved input selection is restored after manager recreation", async () => {
  const storage = createStorage({ [MIDI_INPUT_PREFERENCE_KEY]: "two" });
  const access = createAccess([createInput("one"), createInput("two")]);
  const manager = createMidiInputManager({
    requestAccess: () => Promise.resolve(access),
    storage,
  });

  assert.equal(manager.snapshot().selectedInputId, "two");
  assert.equal((await manager.connect()).connected, true);
  assert.equal(access.inputs.values().next().value.onmidimessage, null);
  assert.equal(
    access.inputs.get("two").onmidimessage instanceof Function,
    true,
  );
});

Deno.test("disconnected selections retain their preference and report disconnected", async () => {
  const storage = createStorage();
  const access = createAccess([createInput("one", "Device", "disconnected")]);
  const manager = createMidiInputManager({
    requestAccess: () => Promise.resolve(access),
    storage,
  });

  await manager.connect();
  assert.equal(manager.snapshot().connected, false);
  assert.throws(() => manager.selectInput("one"));
  manager.selectInput(ALL_MIDI_INPUTS);
  assert.equal(manager.snapshot().connected, false);
});

Deno.test("device state changes refresh connection status and rebind selection", async () => {
  const input = createInput("one");
  const access = createAccess([input]);
  const states = [];
  const manager = createMidiInputManager({
    requestAccess: () => Promise.resolve(access),
    onChange: (state) => states.push(state),
  });

  await manager.connect();
  input.state = "disconnected";
  access.onstatechange();
  assert.equal(states.at(-1).connected, false);
  input.state = "connected";
  access.onstatechange();
  assert.equal(states.at(-1).connected, true);
  assert.equal(input.onmidimessage instanceof Function, true);
});
