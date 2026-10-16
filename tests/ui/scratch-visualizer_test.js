import assert from "node:assert/strict";
import { compileScoreData } from "../../src/domain/score-compiler.js";
import { buildScratchVisualizer } from "../../src/ui/scratch-visualizer.js";

const snapshotCases = [
  {
    name: "baby-scratch",
    score: [["F", "B", "F", "B"], ["F", "B", "F", "B"]],
    playbackState: {},
  },
  {
    name: "keep-flare-playhead",
    score: [["FF", "K", "F", "BM"], ["BO", "BC", "F", "K"]],
    playbackState: { isPlaying: true, currentStep: 6 },
  },
];

for (const { name, score, playbackState } of snapshotCases) {
  Deno.test(`buildScratchVisualizer matches ${name} SVG snapshot`, async () => {
    const scoreData = compileScoreData({
      name,
      difficulty: "Test",
      beat: "4/4",
      score,
    });
    const actual = buildScratchVisualizer(
      scoreData.steps,
      { scoreData },
      playbackState,
    );
    const expected = await Deno.readTextFile(
      new URL(`./snapshots/${name}.svg`, import.meta.url),
    );

    assert.equal(actual, expected);
  });
}
