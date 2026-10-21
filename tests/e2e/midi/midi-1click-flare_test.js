import { runMidiChallengeScenario } from "./challenge-scenario.js";

Deno.test("1 Click Flare Orbit: combined MIDI Scratch and Fader input", async (t) => {
  await runMidiChallengeScenario(t, {
    name: "1 Click Flare Orbit",
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
    // One cut halfway through each second half-beat cell of a stroke.
    cuts: [562.5, 1312.5, 2062.5, 2812.5, 3562.5, 4312.5, 5062.5, 5812.5],
    counts: { forward: 8, backward: 8, faderOpen: 16, faderClosed: 16 },
  });
});
