export function deriveBuilderDirections(steps, initialDirection = "F") {
  let direction = initialDirection;
  return steps.map((step) => {
    if (step === "L") direction = "F";
    if (step === "R") direction = "B";
    return direction;
  });
}

function greatestCommonDivisor(left, right) {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a;
}

function leastCommonMultiple(left, right) {
  return Math.abs((left / greatestCommonDivisor(left, right)) * right);
}

export function parseScoreToken(value, inheritedDirection) {
  const token = value.trim();
  const keepMatch = /^K(\d*)$/.exec(token);
  if (keepMatch) {
    const repeat = keepMatch[1] ? Number(keepMatch[1]) : 1;
    if (!Number.isInteger(repeat) || repeat < 1 || repeat > 128) {
      throw new Error(`繰り返し数が範囲外です: ${value}`);
    }
    return {
      direction: inheritedDirection,
      modifier: "",
      repeat,
      cutCount: 0,
      keep: true,
    };
  }

  if (token === "-") {
    throw new Error(
      "継続用の符号は廃止されています。FまたはBなどを指定してください。",
    );
  }

  const match = /^([FB])([OMCF]?)(\d*)$/.exec(token);
  if (!match) {
    throw new Error(`符号データが不正です: ${value}`);
  }

  const repeat = match[3] ? Number(match[3]) : 1;
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 128) {
    throw new Error(`繰り返し数が範囲外です: ${value}`);
  }

  const modifier = match[2] || "";
  return {
    direction: match[1],
    modifier,
    repeat,
    cutCount: modifier === "C" || modifier === "F" ? 1 : 0,
    keep: false,
  };
}

export function compileScoreData(data) {
  if (
    !data || typeof data !== "object" || typeof data.name !== "string" ||
    !Array.isArray(data.score) || !data.score.length
  ) {
    throw new Error("nameとscore配列が必要です。");
  }

  const beatMatch = typeof data.beat === "string" &&
    /^(\d+)\/(\d+)$/.exec(data.beat);
  if (!beatMatch || Number(beatMatch[1]) < 1 || Number(beatMatch[2]) < 1) {
    throw new Error("beatは4/4のような拍子で指定してください。");
  }

  const beatNumerator = Number(beatMatch[1]);
  const beatDenominator = Number(beatMatch[2]);
  const beatsPerBar = (beatNumerator * 4) / beatDenominator;
  const baseTicksPerBar = (beatNumerator * 8) / beatDenominator;
  if (!Number.isInteger(baseTicksPerBar)) {
    throw new Error("この拍子は8分音符単位へ分割できません。");
  }

  const divisions = [baseTicksPerBar];
  let lastDirection = "F";

  function collectDivisions(node, parentDivision = 1) {
    if (Array.isArray(node)) {
      if (!node.length) throw new Error("score内の配列を空にできません。");
      const division = parentDivision * node.length;
      divisions.push(division);
      node.forEach((child) => collectDivisions(child, division));
      return;
    }
    if (typeof node !== "string") {
      throw new Error("scoreは文字列または入れ子配列で指定してください。");
    }
    const parsed = parseScoreToken(node, lastDirection);
    lastDirection = parsed.direction;
    divisions.push(parentDivision * parsed.repeat);
  }

  data.score.forEach((bar) => collectDivisions(bar));
  const ticksPerBar = divisions.reduce(leastCommonMultiple, 1);
  if (ticksPerBar > 768) {
    throw new Error("細分が多すぎます（1小節768分割まで）。");
  }

  const events = [];
  lastDirection = "F";
  let faderOpen = true;

  function expandNode(node, startTick, durationTicks) {
    if (Array.isArray(node)) {
      if (!node.length || durationTicks % node.length !== 0) {
        throw new Error("小節内の配列を等分できません。");
      }
      const childDuration = durationTicks / node.length;
      node.forEach((child, index) =>
        expandNode(child, startTick + index * childDuration, childDuration)
      );
      return;
    }

    const parsed = parseScoreToken(node, lastDirection);
    lastDirection = parsed.direction;
    if (durationTicks % parsed.repeat !== 0) {
      throw new Error(`繰り返し数を時間分割できません: ${node}`);
    }

    const repeatDuration = durationTicks / parsed.repeat;
    for (let repeat = 0; repeat < parsed.repeat; repeat += 1) {
      if (parsed.modifier === "M") faderOpen = false;
      else if (parsed.modifier === "O") faderOpen = true;
      else if (parsed.cutCount > 0) faderOpen = true;
      events.push({
        startTick: startTick + repeat * repeatDuration,
        durationTicks: repeatDuration,
        direction: parsed.direction,
        modifier: parsed.modifier,
        cutCount: parsed.cutCount,
        keep: parsed.keep,
        faderOpen,
      });
    }
  }

  data.score.forEach((bar, index) => {
    expandNode(bar, index * ticksPerBar, ticksPerBar);
  });

  const totalTicks = data.score.length * ticksPerBar;
  const steps = Array(totalTicks).fill("-");
  const directions = Array(totalTicks).fill("F");
  events.forEach((event) => {
    const step = event.keep
      ? "K"
      : !event.faderOpen
      ? "M"
      : event.direction === "F"
      ? "L"
      : "R";
    for (
      let tick = event.startTick;
      tick < event.startTick + event.durationTicks;
      tick += 1
    ) {
      steps[tick] = step;
      directions[tick] = event.direction;
    }
    for (let mark = 0; event.faderOpen && mark < event.cutCount; mark += 1) {
      const cutTick = event.startTick +
        Math.floor(event.durationTicks * (mark + 1) / (event.cutCount + 1));
      if (cutTick < event.startTick + event.durationTicks) steps[cutTick] = "C";
    }
  });

  return {
    source: data,
    events,
    steps,
    beat: data.beat,
    beatsPerBar,
    ticksPerBar,
    totalTicks,
    tickDurationSeconds: beatsPerBar / ticksPerBar,
    directions,
  };
}
