import { runMidiChallengeScenario } from "./challenge-scenario.js";

Deno.test("Transformer Scratch: MIDI detects both Fader Open and Close", async (t) => {
  await runMidiChallengeScenario(t, {
    name: "Transformer Scratch",
    strokes: [
      [0, 60],
      [750, 61],
      [1500, 60],
      [2250, 61],
      [3000, 60],
      [3750, 61],
      [4500, 60],
      [5250, 61],
    ],
    cuts: [0, 750, 1500, 2250, 3000, 3750, 4500, 5250].flatMap((start) =>
      [125, 375, 625].map((offset) => start + offset)
    ),
    counts: { forward: 8, backward: 8, faderOpen: 48, faderClosed: 48 },
  });
});
