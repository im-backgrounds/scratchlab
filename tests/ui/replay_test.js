import assert from "node:assert/strict";
import { bindReplay, renderReplay } from "../../src/ui/replay.js";

Deno.test("Replay Panel binds controls and renders unavailable paused playing end and gap states", () => {
  const previous = globalThis.document;
  const nodes = new Map();
  globalThis.document = {
    getElementById(id) {
      if (!nodes.has(id)) {
        nodes.set(id, {
          textContent: "",
          disabled: false,
          setAttribute(name, value) {
            this[name] = value;
          },
          addEventListener(event, callback) {
            this[event] = callback;
          },
        });
      }
      return nodes.get(id);
    },
  };
  try {
    const actions = [];
    bindReplay({
      onPlay: () => actions.push("play"),
      onPause: () => actions.push("pause"),
      onStop: () => actions.push("stop"),
      onSeek: (progress) => actions.push(progress),
    });
    for (const name of ["play", "pause", "stop"]) {
      nodes.get(`replay-${name}`).click();
    }
    assert.deepEqual(actions, ["play", "pause", "stop"]);
    nodes.get("replay-seek").value = "0.75";
    nodes.get("replay-seek").input();
    assert.equal(actions.at(-1), 0.75);
    renderReplay(null);
    assert.equal(nodes.get("replay-play").disabled, true);
    assert.equal(nodes.get("replay-pause").disabled, true);
    assert.equal(nodes.get("replay-stop").disabled, true);
    assert.equal(nodes.get("replay-seek").disabled, true);
    assert.equal(nodes.get("replay-seek").value, "0");
    const state = {
      isPlaying: false,
      currentTime: 1234.5,
      currentLoop: 2,
      progress: 0.5,
    };
    renderReplay(state);
    assert.equal(nodes.get("replay-current-time").textContent, "1234 ms");
    assert.equal(nodes.get("replay-current-loop").textContent, "Loop 2");
    assert.equal(nodes.get("replay-progress").textContent, "50%");
    assert.equal(nodes.get("replay-play").disabled, false);
    assert.equal(nodes.get("replay-seek").disabled, false);
    assert.equal(nodes.get("replay-seek").value, "0.5");
    assert.equal(nodes.get("replay-seek")["aria-valuetext"], "50%");
    renderReplay({ ...state, isPlaying: true });
    assert.equal(nodes.get("replay-play").disabled, true);
    assert.equal(nodes.get("replay-pause").disabled, false);
    assert.equal(nodes.get("replay-seek").disabled, false);
    renderReplay({ ...state, progress: 1 });
    assert.equal(nodes.get("replay-progress").textContent, "100%");
    assert.equal(nodes.get("replay-play").disabled, true);
    assert.equal(nodes.get("replay-stop").disabled, false);
    assert.equal(nodes.get("replay-seek").value, "1");
    renderReplay({ ...state, currentLoop: null });
    assert.equal(nodes.get("replay-current-loop").textContent, "—");
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});
