/**
 * Finds the event active at a tick and the event that starts exactly there.
 * @param {object|null} scoreData Compiled score data, if available.
 * @param {number} currentTick Playback cursor in ticks.
 * @returns {{activeEvent: object|null, eventIndex: number}}
 */
export function getPlaybackEvent(scoreData, currentTick) {
  if (!scoreData) return { activeEvent: null, eventIndex: -1 };

  let activeEvent = null;
  let eventIndex = -1;
  scoreData.events.forEach((event, index) => {
    if (
      !activeEvent && event.startTick <= currentTick &&
      currentTick < event.startTick + event.durationTicks
    ) {
      activeEvent = event;
    }
    if (eventIndex < 0 && event.startTick === currentTick) {
      eventIndex = index;
    }
  });
  return { activeEvent, eventIndex };
}

/**
 * Reports whether two valid stroke directions continue in the same direction.
 * @param {string|undefined} currentDirection Direction of the current stroke.
 * @param {string|undefined} previousDirection Direction of the preceding stroke.
 * @returns {boolean}
 */
export function shouldContinueStroke(currentDirection, previousDirection) {
  const validDirection = ["L", "R", "F", "B"].includes(currentDirection);
  return validDirection && currentDirection === previousDirection;
}

/**
 * Computes click-track decisions for the current tick.
 * @param {object|null} scoreGrid Score timing grid, when available.
 * @param {number} currentStep Current playback step.
 * @param {number} clickIntervalSteps Configured click interval.
 * @param {boolean} clickEnabled Whether click playback is enabled.
 * @returns {{shouldPlay: boolean, isDownbeat: boolean}}
 */
export function getClickActions(
  scoreGrid,
  currentStep,
  clickIntervalSteps,
  clickEnabled,
) {
  const ticksPerQuarter = scoreGrid
    ? scoreGrid.ticksPerBar / scoreGrid.beatsPerBar
    : 2;
  const clickInterval = scoreGrid
    ? Math.max(1, Math.round(ticksPerQuarter * clickIntervalSteps / 2))
    : clickIntervalSteps;
  const isDownbeat = scoreGrid
    ? currentStep % scoreGrid.ticksPerBar === 0
    : currentStep % 8 === 0;
  return {
    shouldPlay: clickEnabled && currentStep % clickInterval === 0,
    isDownbeat,
  };
}

/**
 * Reports whether an event should silence active scratch sources.
 * @param {object|null} activeEvent Score event active at the current tick.
 * @returns {boolean}
 */
export function shouldSilenceScratch(activeEvent) {
  return activeEvent?.keep === true;
}

/**
 * Checks event continuity and playback traits against an adjacent event.
 * @param {object} candidate Event being considered for the run.
 * @param {object} reference Event that determines the stroke direction.
 * @param {number} expectedTick Boundary the candidate must touch.
 * @param {boolean} joinsAtStart Whether the candidate begins at that boundary.
 * @param {boolean} requireNoCuts Whether cut events must be excluded.
 * @param {string|null} modifier Required modifier, or null for any modifier.
 * @returns {boolean}
 */
function canJoinEvent(
  candidate,
  reference,
  expectedTick,
  joinsAtStart,
  requireNoCuts,
  modifier,
) {
  return candidate.faderOpen &&
    !candidate.keep &&
    (!requireNoCuts || candidate.cutCount === 0) &&
    (modifier === null || candidate.modifier === modifier) &&
    shouldContinueStroke(candidate.direction, reference.direction) &&
    (joinsAtStart
      ? candidate.startTick === expectedTick
      : candidate.startTick + candidate.durationTicks === expectedTick);
}

/**
 * Detects whether an unmodified event is part of an earlier flare's tail.
 * @param {object[]} events Compiled score events.
 * @param {number} eventIndex Index of the current event.
 * @param {object} event Current event.
 * @returns {boolean}
 */
function followsFlareTail(events, eventIndex, event) {
  if (event.modifier !== "") return false;

  let previousIndex = eventIndex - 1;
  let previousEndTick = event.startTick;
  while (previousIndex >= 0) {
    const previous = events[previousIndex];
    if (!canJoinEvent(previous, event, previousEndTick, false, false, null)) {
      break;
    }
    if (previous.modifier === "F") return true;
    if (previous.modifier !== "") break;
    previousEndTick = previous.startTick;
    previousIndex -= 1;
  }
  return false;
}

/**
 * Resolves the contiguous event run used to extend a scratch sound.
 * @param {object[]} events Compiled score events.
 * @param {number} eventIndex Index of the triggering event.
 * @returns {{startIndex: number, endIndex: number, startTick: number, endTick: number, followsFlare: boolean}|null}
 */
function getPlaybackRun(events, eventIndex) {
  const event = events[eventIndex];
  if (!event || !event.faderOpen || event.keep) return null;

  let startIndex = eventIndex;
  let endIndex = eventIndex;
  let startTick = event.startTick;
  let endTick = event.startTick + event.durationTicks;
  const followsFlare = followsFlareTail(events, eventIndex, event);

  if (event.modifier === "F") {
    while (endIndex + 1 < events.length) {
      const next = events[endIndex + 1];
      if (!canJoinEvent(next, event, endTick, true, false, "")) break;
      endIndex += 1;
      endTick = next.startTick + next.durationTicks;
    }
  } else if (!followsFlare && event.cutCount === 0) {
    while (startIndex > 0) {
      const previous = events[startIndex - 1];
      if (!canJoinEvent(previous, event, startTick, false, true, null)) break;
      startIndex -= 1;
      startTick = previous.startTick;
    }
    while (endIndex + 1 < events.length) {
      const next = events[endIndex + 1];
      if (!canJoinEvent(next, event, endTick, true, true, null)) break;
      endIndex += 1;
      endTick = next.startTick + next.durationTicks;
    }
  }

  return { startIndex, endIndex, startTick, endTick, followsFlare };
}

/**
 * Determines the scratch sound, if any, triggered at a score event boundary.
 * @param {object} scoreData Compiled score and timing data.
 * @param {number} eventIndex Index of the event beginning at the current tick.
 * @param {number} bpm Current playback tempo.
 * @returns {{soundType: string, startTick: number, options: object}|null}
 */
export function buildScratchTrigger(scoreData, eventIndex, bpm) {
  const run = getPlaybackRun(scoreData.events, eventIndex);
  if (!run || run.followsFlare || run.startIndex !== eventIndex) return null;

  const event = scoreData.events[eventIndex];
  const direction = event.direction === "F" ? -1 : 1;
  const soundType = event.modifier === "C"
    ? "C"
    : event.modifier === "F"
    ? "F"
    : direction < 0
    ? "L"
    : "R";
  const durationTicks = run.endTick - run.startTick;
  const durationSeconds = durationTicks * scoreData.tickDurationSeconds * 60 /
    bpm;
  return {
    soundType,
    startTick: run.startTick,
    options: {
      direction,
      durationSeconds,
      cutCount: event.cutCount,
      suppressFriction: run.endIndex > eventIndex,
    },
  };
}

/**
 * Counts consecutive legacy steps that form one same-direction stroke.
 * @param {string[]} steps Legacy chart playback steps.
 * @param {number} stepIndex Index where the stroke begins.
 * @returns {number}
 */
function getStrokeRunLength(steps, stepIndex) {
  const stroke = steps[stepIndex];
  if (stroke !== "L" && stroke !== "R") return 1;

  let runLength = 1;
  while (steps[stepIndex + runLength] === stroke) {
    runLength += 1;
  }
  return runLength;
}

/**
 * Computes the scratch-source trigger for a score or legacy-step chart.
 * @param {object|null} scoreData Compiled score data, if available.
 * @param {string[]} steps Playback steps.
 * @param {number} currentStep Current playback cursor.
 * @param {number} bpm Current playback tempo.
 * @param {number} eventIndex Index of the event beginning at the current tick.
 * @returns {{soundType: string, startTick: number, strokeRunLength: number, options?: object}|null}
 */
export function getScratchActions(
  scoreData,
  steps,
  currentStep,
  bpm,
  eventIndex = -1,
) {
  if (scoreData) {
    const trigger = buildScratchTrigger(scoreData, eventIndex, bpm);
    return trigger
      ? {
        soundType: trigger.soundType,
        startTick: trigger.startTick,
        strokeRunLength: 1,
        options: trigger.options,
      }
      : null;
  }

  const currentType = steps[currentStep];
  if (shouldContinueStroke(currentType, steps[currentStep - 1])) return null;
  return {
    soundType: currentType,
    startTick: currentStep,
    strokeRunLength: getStrokeRunLength(steps, currentStep),
  };
}

/**
 * Identifies whether the current tick is the end of a pattern and its action.
 * @param {number} currentStep Current playback step.
 * @param {number} totalSteps Number of steps in the selected pattern.
 * @param {boolean} repeat Whether playback loops at the end.
 * @returns {"loop"|"stop"|null}
 */
export function handlePlaybackBoundary(currentStep, totalSteps, repeat) {
  if (currentStep < totalSteps - 1) return null;
  return repeat ? "loop" : "stop";
}

/**
 * Computes the cursor after processing one playback step.
 * @param {number} currentStep Current playback step.
 * @param {number} totalSteps Number of steps in the selected pattern.
 * @param {boolean} repeat Whether playback loops at the end.
 * @returns {{currentStep: number, shouldStop: boolean}}
 */
export function updatePlaybackCursor(currentStep, totalSteps, repeat) {
  const boundary = handlePlaybackBoundary(currentStep, totalSteps, repeat);
  if (boundary === "stop") return { currentStep: 0, shouldStop: true };
  if (boundary === "loop") return { currentStep: 0, shouldStop: false };
  return { currentStep: currentStep + 1, shouldStop: false };
}

/**
 * Captures a v2 control boundary without generating input or changing its state.
 * Times use the same absolute millisecond clock as input events.
 * @param {{edge: "start"|"end", sessionId: string, loopIndex: number,
 *   phase: "demo"|"recording", time: number,
 *   inputState: {currentDirection: string, faderState: string}}} options
 */
export function createLoopBoundary({
  edge,
  sessionId,
  loopIndex,
  phase,
  time,
  inputState,
}) {
  if (
    !["start", "end"].includes(edge) ||
    typeof sessionId !== "string" || !sessionId.length ||
    !Number.isInteger(loopIndex) || loopIndex < 0 ||
    !["demo", "recording"].includes(phase) ||
    !Number.isFinite(time) ||
    !["unknown", "forward", "backward", "stopped"].includes(
      inputState?.currentDirection,
    ) ||
    !["unknown", "open", "closed"].includes(inputState?.faderState)
  ) {
    throw new TypeError("Invalid loop boundary");
  }
  return Object.freeze({
    type: "loop-boundary",
    edge,
    sessionId,
    loopIndex,
    phase,
    time,
    currentDirection: inputState.currentDirection,
    faderState: inputState.faderState,
  });
}

/**
 * Builds a completed v2 loop state. Boundary events remain separate from input.
 * @param {ReturnType<typeof createLoopBoundary>} start
 * @param {ReturnType<typeof createLoopBoundary>} end
 */
export function createLoopState(start, end) {
  if (
    start.edge !== "start" || end.edge !== "end" ||
    start.sessionId !== end.sessionId ||
    start.loopIndex !== end.loopIndex || start.phase !== end.phase ||
    end.time <= start.time
  ) {
    throw new TypeError("Loop boundaries must describe the same nonempty loop");
  }
  return Object.freeze({
    sessionId: start.sessionId,
    loopIndex: start.loopIndex,
    phase: start.phase,
    startTime: start.time,
    endTime: end.time,
    startDirection: start.currentDirection,
    startFaderState: start.faderState,
  });
}

/**
 * A boundary-time input belongs to the next loop: [startTime, endTime).
 * @param {{time: number}} event
 * @param {ReturnType<typeof createLoopState>} loop
 */
export function isEventInLoop(event, loop) {
  return event.time >= loop.startTime && event.time < loop.endTime;
}
