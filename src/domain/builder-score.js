import { compileScoreData, deriveBuilderDirections } from "./score-compiler.js";

export function legacyStepsToScore(steps, { directions, ticksPerBar }) {
  let lastDirection = "F";
  let faderOpen = true;
  const tokens = steps.map((step, index) => {
    if (step === "L") {
      lastDirection = "F";
      if (!faderOpen) {
        faderOpen = true;
        return "FO";
      }
      return "F";
    }
    if (step === "R") {
      lastDirection = "B";
      if (!faderOpen) {
        faderOpen = true;
        return "BO";
      }
      return "B";
    }
    if (step === "M") {
      const direction = directions[index] || lastDirection;
      if (direction) lastDirection = direction;
      faderOpen = false;
      return `${lastDirection}M`;
    }
    if (step === "C") {
      faderOpen = true;
      return `${lastDirection}C`;
    }
    if (step === "S") {
      faderOpen = true;
      return `${lastDirection}C3`;
    }
    if (step === "P") {
      faderOpen = true;
      return `${lastDirection}F`;
    }
    if (step === "K") {
      return "K";
    }
    const token = faderOpen ? lastDirection : `${lastDirection}O`;
    faderOpen = true;
    return token;
  });

  const score = [];
  for (let index = 0; index < tokens.length; index += ticksPerBar) {
    score.push(tokens.slice(index, index + ticksPerBar));
  }
  return score;
}

export function compileBuilderSteps(
  { name, difficulty, beat, ticksPerBar, steps, directions },
) {
  return compileScoreData({
    name,
    difficulty,
    beat,
    score: legacyStepsToScore(steps, { directions, ticksPerBar }),
  });
}

export function replaceBuilderStep(steps, directions, index, stepType) {
  const nextSteps = [...steps];
  const nextDirections = [...directions];
  nextSteps[index] = stepType;
  if (stepType === "L") nextDirections[index] = "F";
  if (stepType === "R") nextDirections[index] = "B";
  return { steps: nextSteps, directions: nextDirections };
}

export function resizeSteps(steps, nextLength) {
  const nextSteps = [...steps];
  if (nextSteps.length < nextLength) {
    while (nextSteps.length < nextLength) nextSteps.push("L");
  } else {
    nextSteps.length = nextLength;
  }
  return { steps: nextSteps, directions: deriveBuilderDirections(nextSteps) };
}

export function alternatingSteps(length) {
  const steps = Array.from(
    { length },
    (_, index) => (index % 2 === 0 ? "L" : "R"),
  );
  return { steps, directions: deriveBuilderDirections(steps) };
}
