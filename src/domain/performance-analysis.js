import { COUNT_KEYS } from "./performance.js";
import { createStopObservation } from "./midi-mapping.js";
import { createLoopBoundary, isEventInLoop } from "./playback.js";

export const EVENT_MODEL_VERSION = 2;

/** Event kinds in the same vocabulary as the performance counts. */
const KIND_LANES = {
  forward: "scratch",
  backward: "scratch",
  stop: "scratch",
  faderOpen: "fader",
  faderClosed: "fader",
};

export function getEventKind(event) {
  if (!event || typeof event !== "object") return null;
  if (event.type === "scratch") {
    return ["forward", "backward", "stop"].includes(event.direction)
      ? event.direction
      : null;
  }
  if (event.type === "fader") {
    if (event.state === "open") return "faderOpen";
    if (event.state === "closed") return "faderClosed";
  }
  return null;
}

/**
 * Converts compiled score data into the ordered events a performer should
 * produce. Each stroke is one scratch event, fader state changes and cuts
 * become fader events, and the performance ends with a stop. The fader is
 * assumed open at the start. Keep ("K") cells continue the previous stroke
 * and add no events. Events carry no timing.
 * @param {{events: object[]}} scoreData Output of compileScoreData.
 * @returns {{type: string, direction?: string, state?: string}[]}
 * @deprecated v1 regression coverage only. Use createExpectedTimeline.
 */
export function createExpectedEvents(scoreData) {
  const expected = [];
  let faderOpen = true;
  const fader = (open) => {
    expected.push({ type: "fader", state: open ? "open" : "closed" });
    faderOpen = open;
  };

  for (const event of scoreData.events) {
    if (event.keep) continue;
    if (event.faderOpen !== faderOpen) fader(event.faderOpen);
    expected.push({
      type: "scratch",
      direction: event.direction === "F" ? "forward" : "backward",
    });
    for (let cut = 0; event.faderOpen && cut < event.cutCount; cut += 1) {
      fader(false);
      fader(true);
    }
  }
  if (expected.length) expected.push({ type: "scratch", direction: "stop" });
  return expected;
}

/**
 * Builds the v2 meaning-event timeline in score ticks. The initial fader is
 * open; cuts preserve direction, and neither K nor the end implies a Stop.
 * Shared by runtime matching, timing analysis, and controller overlay.
 * @param {{events: object[]}} scoreData Compiled score data.
 * @returns {({type: "scratch", direction: "forward"|"backward", tick: number}
 *   | {type: "fader", state: "open"|"closed", tick: number})[]}
 */
export function createExpectedTimeline(scoreData) {
  const timeline = [];
  let currentDirection = null;
  let faderOpen = true;
  const fader = (open, tick) => {
    if (open === faderOpen) return;
    timeline.push({ type: "fader", state: open ? "open" : "closed", tick });
    faderOpen = open;
  };

  for (const event of scoreData.events) {
    if (event.keep) continue;
    fader(event.faderOpen, event.startTick);
    const direction = event.direction === "F" ? "forward" : "backward";
    if (direction !== currentDirection) {
      timeline.push({ type: "scratch", direction, tick: event.startTick });
      currentDirection = direction;
    }
    for (let cut = 0; event.faderOpen && cut < event.cutCount; cut += 1) {
      const tick = event.startTick +
        event.durationTicks * (cut + 1) / (event.cutCount + 1);
      fader(false, tick);
      fader(true, tick);
    }
  }
  return timeline;
}

/**
 * Aligns two kind sequences with a longest common subsequence and returns
 * which indexes of each side were matched.
 */
function alignSequences(expected, actual) {
  const rows = expected.length + 1;
  const cols = actual.length + 1;
  const table = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = expected.length - 1; i >= 0; i -= 1) {
    for (let j = actual.length - 1; j >= 0; j -= 1) {
      table[i][j] = expected[i] === actual[j]
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const matchedExpected = new Set();
  const matchedActual = new Set();
  let i = 0;
  let j = 0;
  while (i < expected.length && j < actual.length) {
    if (expected[i] === actual[j]) {
      matchedExpected.add(i);
      matchedActual.add(j);
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return { matchedExpected, matchedActual };
}

function createEmptyTally() {
  return { matched: 0, missing: 0, extra: 0 };
}

/**
 * Independent v2 sequence matcher. Input is already compressed; timestamps
 * determine loop ownership only. Initial-state matches have no timing pair.
 * @param {ReturnType<typeof createExpectedTimeline>} expectedTimeline
 * @param {object[]} recordedTimeline Absolute-time meaning/control events.
 * @param {ReturnType<typeof import("./playback.js").createLoopState>[]} loopStates
 */
export function matchPerformanceTimeline(
  expectedTimeline,
  recordedTimeline,
  loopStates,
) {
  const meaningKinds = ["forward", "backward", "faderOpen", "faderClosed"];
  const expectedKinds = expectedTimeline.map((event, index) => {
    const kind = getEventKind(event);
    if (
      !meaningKinds.includes(kind) || !Number.isFinite(event.tick) ||
      event.tick < 0 ||
      (index > 0 && event.tick < expectedTimeline[index - 1].tick)
    ) {
      throw new TypeError(
        "Expected a chronologically ordered meaning timeline",
      );
    }
    return kind;
  });
  const recordedKinds = recordedTimeline.map((event, index) => {
    if (
      !event || !Number.isFinite(event.time) ||
      (index > 0 && event.time < recordedTimeline[index - 1].time)
    ) {
      throw new TypeError(
        "Expected a chronologically ordered recorded timeline",
      );
    }
    const kind = getEventKind(event);
    if (meaningKinds.includes(kind) || kind === "stop") return kind;
    if (event.type === "stop") {
      const observation = createStopObservation(event);
      if (
        event.reason !== observation.reason || event.time !== observation.time
      ) throw new TypeError("Invalid physical stop observation");
      return null;
    }
    if (event.type === "loop-boundary") {
      createLoopBoundary({
        ...event,
        inputState: {
          currentDirection: event.currentDirection,
          faderState: event.faderState,
        },
      });
      return null;
    }
    throw new TypeError("Unknown recorded timeline event");
  });
  if (!loopStates.length) throw new TypeError("At least one loop is required");
  loopStates.forEach((loop, index) => {
    const previous = loopStates[index - 1];
    if (
      !loop || typeof loop.sessionId !== "string" || !loop.sessionId.length ||
      !Number.isInteger(loop.loopIndex) || loop.loopIndex < 0 ||
      !["demo", "recording"].includes(loop.phase) ||
      !Number.isFinite(loop.startTime) || !Number.isFinite(loop.endTime) ||
      loop.endTime <= loop.startTime ||
      !["unknown", "forward", "backward", "stopped"].includes(
        loop.startDirection,
      ) ||
      !["unknown", "open", "closed"].includes(loop.startFaderState) ||
      (previous && (
        loop.sessionId !== previous.sessionId ||
        loop.loopIndex <= previous.loopIndex ||
        loop.startTime < previous.endTime
      ))
    ) throw new TypeError("Invalid or overlapping loop states");
  });

  const byKind = Object.fromEntries(
    meaningKinds.map((kind) => [kind, createEmptyTally()]),
  );
  const pairs = [];
  const missingEvents = [];
  const extraEvents = [];
  const assignedActual = new Set();
  const loops = loopStates.filter((loop) => loop.phase === "recording").map(
    (loop) => {
      const actualIndexes = recordedTimeline.flatMap((event, index) =>
        meaningKinds.includes(recordedKinds[index]) &&
          isEventInLoop(event, loop)
          ? [index]
          : []
      );
      actualIndexes.forEach((index) => assignedActual.add(index));
      const loopPairs = [];
      const loopMissing = [];
      const loopExtra = [];
      for (const lane of ["scratch", "fader"]) {
        const expectedIndexes = expectedKinds.flatMap((kind, index) =>
          KIND_LANES[kind] === lane ? [index] : []
        );
        const laneActualIndexes = actualIndexes.filter((index) =>
          KIND_LANES[recordedKinds[index]] === lane
        );
        const first = expectedIndexes[0];
        // Boundary state is evidence, not an invented input or timing sample.
        if (
          lane === "scratch" && first !== undefined &&
          expectedTimeline[first].tick === 0 &&
          expectedKinds[first] === loop.startDirection
        ) {
          expectedIndexes.shift();
          loopPairs.push({
            loopIndex: loop.loopIndex,
            lane,
            kind: expectedKinds[first],
            expectedIndex: first,
            actualIndex: null,
            expectedTick: 0,
            actualTime: null,
            source: "initial-state",
            timingEligible: false,
          });
        }
        const { matchedExpected, matchedActual } = alignSequences(
          expectedIndexes.map((index) => expectedKinds[index]),
          laneActualIndexes.map((index) => recordedKinds[index]),
        );
        const actualMatches = [...matchedActual];
        [...matchedExpected].forEach((index, matchIndex) => {
          const expectedIndex = expectedIndexes[index];
          const actualIndex = laneActualIndexes[actualMatches[matchIndex]];
          loopPairs.push({
            loopIndex: loop.loopIndex,
            lane,
            kind: expectedKinds[expectedIndex],
            expectedIndex,
            actualIndex,
            expectedTick: expectedTimeline[expectedIndex].tick,
            actualTime: recordedTimeline[actualIndex].time,
            source: "event",
            timingEligible: true,
          });
        });
        expectedIndexes.forEach((expectedIndex, index) => {
          if (!matchedExpected.has(index)) {
            loopMissing.push({
              loopIndex: loop.loopIndex,
              expectedIndex,
              kind: expectedKinds[expectedIndex],
              tick: expectedTimeline[expectedIndex].tick,
            });
          }
        });
        laneActualIndexes.forEach((actualIndex, index) => {
          if (!matchedActual.has(index)) {
            loopExtra.push({
              loopIndex: loop.loopIndex,
              actualIndex,
              kind: recordedKinds[actualIndex],
              time: recordedTimeline[actualIndex].time,
            });
          }
        });
      }
      loopPairs.sort((a, b) => a.expectedIndex - b.expectedIndex);
      loopMissing.sort((a, b) => a.expectedIndex - b.expectedIndex);
      loopExtra.sort((a, b) => a.actualIndex - b.actualIndex);
      for (const pair of loopPairs) byKind[pair.kind].matched += 1;
      for (const event of loopMissing) byKind[event.kind].missing += 1;
      for (const event of loopExtra) byKind[event.kind].extra += 1;
      pairs.push(...loopPairs);
      missingEvents.push(...loopMissing);
      extraEvents.push(...loopExtra);
      const initialState = {
        expectedFaderState: "open",
        actualFaderState: loop.startFaderState,
        status: loop.startFaderState === "unknown"
          ? "unconfirmed"
          : loop.startFaderState === "open"
          ? "valid"
          : "mismatch",
        valid: loop.startFaderState === "open",
      };
      const total = loopPairs.length + loopMissing.length + loopExtra.length;
      return {
        loopIndex: loop.loopIndex,
        matched: loopPairs.length,
        missing: loopMissing.length,
        extra: loopExtra.length,
        accuracy: total
          ? Math.round(loopPairs.length / total * 1000) / 10
          : null,
        initialState,
      };
    },
  );
  const matched = pairs.length;
  const missing = missingEvents.length;
  const extra = extraEvents.length;
  const total = matched + missing + extra;
  return {
    matched,
    missing,
    extra,
    expectedCount: matched + missing,
    actualCount: pairs.filter((pair) => pair.source === "event").length + extra,
    accuracy: total ? Math.round(matched / total * 1000) / 10 : null,
    initialStateValid: loops.length > 0 &&
      loops.every((loop) => loop.initialState.valid),
    pairs,
    missingEvents,
    extraEvents,
    byKind,
    loops,
    unassignedActualIndexes: recordedKinds.flatMap((kind, index) =>
      meaningKinds.includes(kind) && !assignedActual.has(index) ? [index] : []
    ),
  };
}

/**
 * Measures v2 timing from existing matching pairs without re-aligning events.
 * Signed error is positive for late input and negative for early input.
 * @param {{tickDurationSeconds: number}} scoreData Compiled score timing grid.
 * @param {ReturnType<typeof matchPerformanceTimeline>} matching
 * @param {ReturnType<typeof import("./playback.js").createLoopState>[]} loopStates
 * @param {number} bpm
 */
export function analyzeTimelineTiming(scoreData, matching, loopStates, bpm) {
  if (
    !Number.isFinite(bpm) || bpm <= 0 ||
    !Number.isFinite(scoreData.tickDurationSeconds) ||
    scoreData.tickDurationSeconds <= 0
  ) {
    throw new TypeError("A positive BPM and score tick duration are required");
  }
  const millisecondsPerTick = scoreData.tickDurationSeconds * 60000 / bpm;
  if (!Number.isFinite(millisecondsPerTick) || millisecondsPerTick <= 0) {
    throw new TypeError("Milliseconds per tick must be positive and finite");
  }
  const loops = new Map();
  for (const loop of loopStates) {
    if (
      !Number.isInteger(loop.loopIndex) || loop.loopIndex < 0 ||
      loops.has(loop.loopIndex) ||
      !["demo", "recording"].includes(loop.phase) ||
      !Number.isFinite(loop.startTime) || !Number.isFinite(loop.endTime) ||
      loop.endTime <= loop.startTime
    ) throw new TypeError("Invalid timing loop interval");
    loops.set(loop.loopIndex, loop);
  }
  const samples = [];
  for (const pair of matching.pairs) {
    if (
      pair.actualIndex === null || pair.timingEligible === false ||
      pair.source === "initial-state" ||
      !["forward", "backward", "faderOpen", "faderClosed"].includes(pair.kind)
    ) continue;
    const loop = loops.get(pair.loopIndex);
    if (
      pair.source !== "event" || pair.timingEligible !== true ||
      !Number.isInteger(pair.actualIndex) || pair.actualIndex < 0 ||
      !Number.isInteger(pair.expectedIndex) || pair.expectedIndex < 0 ||
      !Number.isFinite(pair.expectedTick) || pair.expectedTick < 0 ||
      !Number.isFinite(pair.actualTime) ||
      !loop || loop.phase !== "recording" ||
      !isEventInLoop({ time: pair.actualTime }, loop)
    ) throw new TypeError("Invalid timing-eligible matching pair");
    const expectedTime = pair.expectedTick * millisecondsPerTick;
    const actualTime = pair.actualTime - loop.startTime;
    const signedErrorMs = actualTime - expectedTime;
    if (
      !Number.isFinite(expectedTime) || !Number.isFinite(actualTime) ||
      !Number.isFinite(signedErrorMs)
    ) throw new TypeError("Timing error must be finite");
    samples.push({
      loopIndex: pair.loopIndex,
      expectedIndex: pair.expectedIndex,
      actualIndex: pair.actualIndex,
      kind: pair.kind,
      expectedTimeMs: expectedTime,
      actualTimeMs: actualTime,
      signedErrorMs,
      absoluteErrorMs: Math.abs(signedErrorMs),
    });
  }
  let averageErrorMs = null;
  let maxErrorMs = null;
  if (samples.length) {
    // Divide before summing to keep large finite errors from overflowing.
    averageErrorMs = samples.reduce(
      (sum, sample) => sum + sample.absoluteErrorMs / samples.length,
      0,
    );
    maxErrorMs = samples.reduce(
      (max, sample) => Math.max(max, sample.absoluteErrorMs),
      0,
    );
  }
  return {
    averageErrorMs,
    maxErrorMs,
    timingAccuracy: averageErrorMs === null
      ? null
      : Math.round(Math.max(0, 100 * (1 - averageErrorMs / 100)) * 10) / 10,
    measuredCount: samples.length,
    samples,
  };
}

/** @deprecated v1 timing helper only. Use createExpectedTimeline ticks. */
function createExpectedEventTicks(scoreData) {
  const ticks = [];
  let faderOpen = true;
  const addFader = (open, tick) => {
    ticks.push(tick);
    faderOpen = open;
  };

  for (const event of scoreData.events) {
    if (event.keep) continue;
    if (event.faderOpen !== faderOpen) {
      addFader(event.faderOpen, event.startTick);
    }
    ticks.push(event.startTick);
    for (let cut = 0; event.faderOpen && cut < event.cutCount; cut += 1) {
      const tick = event.startTick +
        event.durationTicks * (cut + 1) / (event.cutCount + 1);
      addFader(false, tick);
      addFader(true, tick);
    }
  }
  if (ticks.length) ticks.push(scoreData.totalTicks);
  return ticks;
}

/**
 * Measures timing error only for the same events paired by the sequence
 * analysis. Unmatched events are deliberately excluded from all timing metrics.
 * @param {object} scoreData Compiled chart data.
 * @param {object[]} actualEvents Timestamped performance events.
 * @param {number[]} loopEnds Ascending offsets where recorded loops end.
 * @param {number} bpm BPM used for the challenge.
 * @deprecated v1 regression coverage only. Use analyzeTimelineTiming with v2 matching pairs.
 */
export function analyzePerformanceTiming(
  scoreData,
  actualEvents,
  loopEnds = [],
  bpm,
) {
  const expectedEvents = createExpectedEvents(scoreData);
  const expectedTicks = createExpectedEventTicks(scoreData);
  if (expectedEvents.length !== expectedTicks.length) {
    throw new Error("Expected event timing does not match the score events.");
  }
  if (
    !Number.isFinite(bpm) || bpm <= 0 ||
    !Number.isFinite(scoreData.tickDurationSeconds) ||
    scoreData.tickDurationSeconds <= 0
  ) {
    throw new Error("A positive BPM and score tick duration are required.");
  }

  const millisecondsPerTick = scoreData.tickDurationSeconds * 60000 / bpm;
  const errors = [];
  const bounds = [...loopEnds, Infinity];
  let previous = -Infinity;
  for (const end of bounds) {
    const loopEvents = actualEvents.filter((event) =>
      event.t > previous && event.t <= end
    );
    const loopStart = previous === -Infinity ? 0 : previous;

    for (const lane of ["scratch", "fader"]) {
      const isInLane = (event) => KIND_LANES[getEventKind(event)] === lane;
      const expectedIndexes = expectedEvents.flatMap((event, index) =>
        isInLane(event) ? [index] : []
      );
      const actualIndexes = loopEvents.flatMap((event, index) =>
        isInLane(event) ? [index] : []
      );
      const expectedKinds = expectedIndexes.map((index) =>
        getEventKind(expectedEvents[index])
      );
      const actualKinds = actualIndexes.map((index) =>
        getEventKind(loopEvents[index])
      );
      const { matchedExpected, matchedActual } = alignSequences(
        expectedKinds,
        actualKinds,
      );
      const matchedExpectedIndexes = [...matchedExpected];
      const matchedActualIndexes = [...matchedActual];
      for (let index = 0; index < matchedExpectedIndexes.length; index += 1) {
        const expectedEventIndex =
          expectedIndexes[matchedExpectedIndexes[index]];
        const actualEventIndex = actualIndexes[matchedActualIndexes[index]];
        const expectedTime = expectedTicks[expectedEventIndex] *
          millisecondsPerTick;
        const actualTime = loopEvents[actualEventIndex].t - loopStart;
        errors.push(Math.abs(actualTime - expectedTime));
      }
    }
    previous = end;
  }

  if (errors.length === 0) {
    return {
      averageErrorMs: null,
      maxErrorMs: null,
      timingAccuracy: null,
      matchedCount: 0,
    };
  }
  const averageErrorMs = errors.reduce((sum, error) => sum + error, 0) /
    errors.length;
  return {
    averageErrorMs,
    maxErrorMs: Math.max(...errors),
    timingAccuracy: Math.round(
      Math.max(0, Math.min(100, 100 * (1 - averageErrorMs / 100))) * 10,
    ) / 10,
    matchedCount: errors.length,
  };
}

/**
 * Compares a recorded performance with the expected events by sequence only.
 * The scratch lane (forward/backward/stop) and the fader lane are aligned
 * separately, so the order between a fader change and a scratch that happen
 * together does not matter. Timing is ignored.
 * @param {object[]} expectedEvents Output of createExpectedEvents.
 * @param {object[]} actualEvents Events of a performance.
 * @deprecated v1 regression coverage only. Use matchPerformanceTimeline.
 */
export function analyzePerformance(expectedEvents, actualEvents) {
  const byKind = Object.fromEntries(
    COUNT_KEYS.map((key) => [key, createEmptyTally()]),
  );
  const total = createEmptyTally();

  for (const lane of ["scratch", "fader"]) {
    const laneKinds = (events) =>
      events.map(getEventKind).filter((kind) => KIND_LANES[kind] === lane);
    const expected = laneKinds(expectedEvents);
    const actual = laneKinds(actualEvents);
    const { matchedExpected, matchedActual } = alignSequences(
      expected,
      actual,
    );
    expected.forEach((kind, index) => {
      const field = matchedExpected.has(index) ? "matched" : "missing";
      byKind[kind][field] += 1;
      total[field] += 1;
    });
    actual.forEach((kind, index) => {
      if (matchedActual.has(index)) return;
      byKind[kind].extra += 1;
      total.extra += 1;
    });
  }

  const denominator = total.matched + total.missing + total.extra;
  return {
    expectedCount: total.matched + total.missing,
    actualCount: total.matched + total.extra,
    ...total,
    byKind,
    // matched / (matched + missing + extra), so extra events lower it too
    accuracy: denominator === 0
      ? null
      : Math.round((total.matched / denominator) * 1000) / 10,
  };
}

/**
 * Analyzes a recording made of several loops. Each loop is compared with the
 * expected events on its own and the tallies are added up, so a loop never
 * borrows events from its neighbour.
 * @param {object[]} expectedEvents Expected events of one loop.
 * @param {object[]} actualEvents Events of a performance.
 * @param {number[]} [loopEnds] Ascending offsets (ms) where a loop ends. An
 *   event at exactly that offset still belongs to the loop that ends there.
 * @deprecated v1 regression coverage only. Use matchPerformanceTimeline with v2 loop states.
 */
export function analyzePerformanceLoops(
  expectedEvents,
  actualEvents,
  loopEnds = [],
) {
  const bounds = [...loopEnds, Infinity];
  let previous = -Infinity;
  const analyses = bounds.map((end) => {
    const segment = actualEvents.filter((e) => e.t > previous && e.t <= end);
    previous = end;
    return analyzePerformance(expectedEvents, segment);
  });

  const byKind = Object.fromEntries(
    COUNT_KEYS.map((key) => [key, createEmptyTally()]),
  );
  const total = createEmptyTally();
  for (const analysis of analyses) {
    for (const field of ["matched", "missing", "extra"]) {
      total[field] += analysis[field];
      for (const key of COUNT_KEYS) {
        byKind[key][field] += analysis.byKind[key][field];
      }
    }
  }
  const denominator = total.matched + total.missing + total.extra;
  return {
    expectedCount: total.matched + total.missing,
    actualCount: total.matched + total.extra,
    ...total,
    byKind,
    accuracy: denominator === 0
      ? null
      : Math.round((total.matched / denominator) * 1000) / 10,
  };
}
