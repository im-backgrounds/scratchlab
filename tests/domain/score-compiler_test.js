import assert from "node:assert/strict";
import {
  compileScoreData,
  parseScoreToken,
} from "../../src/domain/score-compiler.js";

Deno.test("parseScoreToken parses repeats, cuts, and keep events", () => {
  assert.deepEqual(parseScoreToken("FC3", "B"), {
    direction: "F",
    modifier: "C",
    repeat: 3,
    cutCount: 1,
    keep: false,
  });
  assert.deepEqual(parseScoreToken("K2", "B"), {
    direction: "B",
    modifier: "",
    repeat: 2,
    cutCount: 0,
    keep: true,
  });
  assert.throws(() => parseScoreToken("-", "F"), /廃止されています/);
});

Deno.test("compileScoreData expands nested subdivisions and calculates timing", () => {
  const compiled = compileScoreData({
    name: "Subdivision",
    beat: "4/4",
    score: [["F", ["BM", "FO", "B"]]],
  });

  assert.equal(compiled.ticksPerBar, 24);
  assert.equal(compiled.totalTicks, 24);
  assert.equal(compiled.beatsPerBar, 4);
  assert.equal(compiled.tickDurationSeconds, 1 / 6);
  assert.deepEqual(
    compiled.events.map(({ startTick, durationTicks }) => [
      startTick,
      durationTicks,
    ]),
    [[0, 12], [12, 4], [16, 4], [20, 4]],
  );
});

Deno.test("compileScoreData preserves directions and keep-event timing", () => {
  const compiled = compileScoreData({
    name: "Keep",
    beat: "4/4",
    score: [["F", "K", "B"]],
  });

  assert.deepEqual(
    compiled.events.map(({ direction, keep }) => [direction, keep]),
    [["F", false], ["F", true], ["B", false]],
  );
  assert.equal(compiled.steps[compiled.events[1].startTick], "K");
  assert.equal(compiled.directions[compiled.events[1].startTick], "F");
});

Deno.test("compileScoreData rejects invalid chart data", () => {
  assert.throws(
    () => compileScoreData({ name: "Bad", beat: "4/4", score: [] }),
    /nameとscore配列が必要/,
  );
  assert.throws(
    () => compileScoreData({ name: "Bad", beat: "4/4", score: [["F", "-"]] }),
    /廃止されています/,
  );
});
