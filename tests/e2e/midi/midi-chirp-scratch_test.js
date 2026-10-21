import { runMidiChallengeScenario } from "./challenge-scenario.js";

Deno.test("Chirp Scratch: MIDI Scratch and three-cut Fader groups", async (t) => {
  await runMidiChallengeScenario(t, {
    name: "Chirp Scratch",
    // Sixteen half-beat cells; sustained motion spans adjacent same-direction cells.
    strokes: [
      [0, 60],
      [750, 61],
      [1500, 60],
      [1875, 61],
      [2625, 60],
      [3000, 61],
      [3750, 60],
      [4500, 61],
      [4875, 60],
      [5250, 61],
    ],
    // Each three-cut cell has cuts at 1/6, 1/2 and 5/6 of its duration.
    cuts: [375, 1125, 2250, 3375, 4125, 5625].flatMap((start) =>
      [62.5, 187.5, 312.5].map((offset) => start + offset)
    ),
    counts: { forward: 10, backward: 10, faderOpen: 36, faderClosed: 36 },
  });
});
