import assert from "node:assert/strict";
import {
  describeChallengeInputReadiness,
} from "../../src/features/challenge-input-readiness.js";

Deno.test("MIDI readiness requires connection and scratch/fader mappings", () => {
  const readiness = describeChallengeInputReadiness({
    midiConnected: true,
    midiMapping: {
      forward: { id: "forward" },
      backward: { id: "backward" },
      fader: { id: "fader" },
    },
    practiceModeEnabled: false,
  });

  assert.equal(readiness.canStart, true);
  assert.deepEqual(readiness.missing, []);
  assert.equal(readiness.midiScratchReady, true);
  assert.equal(readiness.midiFaderReady, true);
});

Deno.test("practice mode supplies both scratch and fader input without MIDI", () => {
  const readiness = describeChallengeInputReadiness({
    midiConnected: false,
    midiMapping: {},
    practiceModeEnabled: true,
  });

  assert.equal(readiness.canStart, true);
  assert.deepEqual(readiness.missing, []);
});

Deno.test("MIDI and practice mode can provide complementary input types", () => {
  const readiness = describeChallengeInputReadiness({
    midiConnected: true,
    midiMapping: { forward: {}, backward: {} },
    practiceModeEnabled: true,
  });

  assert.equal(readiness.canStart, true);
  assert.equal(readiness.midiScratchReady, true);
  assert.equal(readiness.midiFaderReady, false);
});

Deno.test("readiness identifies both missing input types when no input is ready", () => {
  const readiness = describeChallengeInputReadiness({
    midiConnected: false,
    midiMapping: {},
    practiceModeEnabled: false,
  });

  assert.equal(readiness.canStart, false);
  assert.deepEqual(readiness.missing, ["スクラッチ入力", "フェーダー入力"]);
});
