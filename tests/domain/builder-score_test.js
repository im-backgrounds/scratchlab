import assert from "node:assert/strict";
import {
  alternatingSteps,
  compileBuilderSteps,
  legacyStepsToScore,
  replaceBuilderStep,
  resizeSteps,
} from "../../src/domain/builder-score.js";

Deno.test("legacyStepsToScore converts legacy step symbols", () => {
  assert.deepEqual(
    legacyStepsToScore(["L", "M", "R", "S", "P", "K"], {
      directions: ["F", "F", "B", "B", "B", "B"],
      ticksPerBar: 3,
    }),
    [["F", "FM", "BO"], ["BC3", "BF", "K"]],
  );
});

Deno.test("replaceBuilderStep edits a cell and updates its direction", () => {
  assert.deepEqual(
    replaceBuilderStep(["L", "R", "M"], ["F", "B", "B"], 1, "L"),
    { steps: ["L", "L", "M"], directions: ["F", "F", "B"] },
  );
});

Deno.test("resizeSteps grows with forward steps and recalculates directions", () => {
  assert.deepEqual(resizeSteps(["L", "R"], 4), {
    steps: ["L", "R", "L", "L"],
    directions: ["F", "B", "F", "F"],
  });
});

Deno.test("resizeSteps truncates steps and directions", () => {
  assert.deepEqual(resizeSteps(["L", "R", "L"], 1), {
    steps: ["L"],
    directions: ["F"],
  });
});

Deno.test("alternatingSteps creates an alternating forward/reverse pattern", () => {
  assert.deepEqual(alternatingSteps(5), {
    steps: ["L", "R", "L", "R", "L"],
    directions: ["F", "B", "F", "B", "F"],
  });
});

Deno.test("compileBuilderSteps compiles legacy builder cells into score data", () => {
  const compiled = compileBuilderSteps({
    name: "Builder",
    difficulty: "Easy",
    beat: "4/4",
    ticksPerBar: 8,
    steps: ["L", "R", "L", "R", "L", "R", "L", "R"],
    directions: ["F", "B", "F", "B", "F", "B", "F", "B"],
  });

  assert.equal(compiled.totalTicks, 8);
  assert.equal(compiled.events.length, 8);
  assert.deepEqual(compiled.steps, ["L", "R", "L", "R", "L", "R", "L", "R"]);
});
