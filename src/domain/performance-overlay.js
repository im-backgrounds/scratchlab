import { getEventKind } from "./performance-analysis.js";
import { isEventInLoop } from "./playback.js";

const MEANING_KINDS = ["forward", "backward", "faderOpen", "faderClosed"];

/**
 * Projects completed v2 analysis into display data, without scoring or matching.
 * SAMPLE positions are score ticks; YOU positions are loop-relative milliseconds.
 * @param {ReturnType<typeof import("./performance-analysis.js").createExpectedTimeline>} expectedTimeline
 * @param {object[]} recordedTimeline
 * @param {ReturnType<typeof import("./playback.js").createLoopState>[]} loopStates
 * @param {ReturnType<typeof import("./performance-analysis.js").matchPerformanceTimeline>} matching
 * @param {ReturnType<typeof import("./performance-analysis.js").analyzeTimelineTiming>} timing
 */
export function createPerformanceOverlay(
  expectedTimeline,
  recordedTimeline,
  loopStates,
  matching,
  timing,
) {
  const fail = () => {
    throw new TypeError("Overlay inputs must belong to the same v2 analysis");
  };
  const expectedKinds = expectedTimeline.map((event) => {
    const kind = getEventKind(event);
    if (!MEANING_KINDS.includes(kind) || !Number.isFinite(event.tick)) fail();
    return kind;
  });
  const loopsByIndex = new Map();
  for (const loop of loopStates) {
    if (loopsByIndex.has(loop.loopIndex)) fail();
    loopsByIndex.set(loop.loopIndex, loop);
  }
  const sample = [];
  const you = [];
  const errors = [];
  const timingTargets = new Map();
  const assignedActual = new Set();
  const seenLoops = new Set();
  for (const result of matching.loops) {
    const loop = loopsByIndex.get(result.loopIndex);
    if (!loop || loop.phase !== "recording" || seenLoops.has(loop.loopIndex)) {
      fail();
    }
    seenLoops.add(loop.loopIndex);
    const expectedEntries = expectedTimeline.map((event, expectedIndex) => ({
      loopIndex: loop.loopIndex,
      expectedIndex,
      kind: expectedKinds[expectedIndex],
      tick: event.tick,
      status: null,
      matchSource: null,
      actualIndex: null,
      timing: null,
    }));
    const actualEntries = new Map(
      recordedTimeline.flatMap((event, actualIndex) => {
        const kind = getEventKind(event);
        if (!MEANING_KINDS.includes(kind) || !isEventInLoop(event, loop)) {
          return [];
        }
        if (assignedActual.has(actualIndex)) fail();
        assignedActual.add(actualIndex);
        return [[actualIndex, {
          loopIndex: loop.loopIndex,
          actualIndex,
          kind,
          time: event.time,
          timeMs: event.time - loop.startTime,
          status: null,
          expectedIndex: null,
          timing: null,
        }]];
      }),
    );
    let matchedCount = 0;
    let missingCount = 0;
    let extraCount = 0;
    for (
      const pair of matching.pairs.filter((item) =>
        item.loopIndex === loop.loopIndex
      )
    ) {
      const target = expectedEntries[pair.expectedIndex];
      if (
        !target || target.status || target.kind !== pair.kind ||
        target.tick !== pair.expectedTick
      ) fail();
      target.status = "matched";
      target.matchSource = pair.source;
      target.actualIndex = pair.actualIndex;
      matchedCount += 1;
      if (pair.actualIndex === null) {
        if (pair.source !== "initial-state" || pair.timingEligible !== false) {
          fail();
        }
        continue;
      }
      const actual = actualEntries.get(pair.actualIndex);
      if (
        !actual || actual.status || actual.kind !== pair.kind ||
        actual.time !== pair.actualTime || pair.source !== "event"
      ) fail();
      actual.status = "matched";
      actual.expectedIndex = pair.expectedIndex;
      if (pair.timingEligible === true) {
        timingTargets.set(
          `${loop.loopIndex}:${pair.expectedIndex}:${pair.actualIndex}`,
          { target, actual },
        );
      }
    }
    for (
      const missing of matching.missingEvents.filter((item) =>
        item.loopIndex === loop.loopIndex
      )
    ) {
      const target = expectedEntries[missing.expectedIndex];
      if (
        !target || target.status || target.kind !== missing.kind ||
        target.tick !== missing.tick
      ) fail();
      target.status = "missing";
      missingCount += 1;
      errors.push({ classification: "missing", ...missing });
    }
    for (
      const extra of matching.extraEvents.filter((item) =>
        item.loopIndex === loop.loopIndex
      )
    ) {
      const actual = actualEntries.get(extra.actualIndex);
      if (
        !actual || actual.status || actual.kind !== extra.kind ||
        actual.time !== extra.time
      ) fail();
      actual.status = "extra";
      extraCount += 1;
      errors.push({ classification: "extra", ...extra, timeMs: actual.timeMs });
    }
    if (
      expectedEntries.some((item) => item.status === null) ||
      [...actualEntries.values()].some((item) => item.status === null) ||
      matchedCount !== result.matched || missingCount !== result.missing ||
      extraCount !== result.extra
    ) fail();
    const initial = result.initialState;
    if (initial.actualFaderState !== loop.startFaderState) fail();
    if (!initial.valid) {
      errors.push({
        classification: "initial-state-error",
        loopIndex: loop.loopIndex,
        tick: 0,
        expectedFaderState: initial.expectedFaderState,
        actualFaderState: initial.actualFaderState,
        status: initial.status,
      });
    }
    sample.push(...expectedEntries);
    you.push(...actualEntries.values());
  }
  if (
    loopStates.filter((loop) => loop.phase === "recording").length !==
      seenLoops.size ||
    [...matching.pairs, ...matching.missingEvents, ...matching.extraEvents]
      .some((item) => !seenLoops.has(item.loopIndex))
  ) fail();
  const seenTiming = new Set();
  for (const measurement of timing.samples) {
    const key =
      `${measurement.loopIndex}:${measurement.expectedIndex}:${measurement.actualIndex}`;
    const entries = timingTargets.get(key);
    if (
      !entries || seenTiming.has(key) ||
      entries.target.kind !== measurement.kind ||
      measurement.actualTimeMs !== entries.actual.timeMs ||
      !Number.isFinite(measurement.expectedTimeMs) ||
      !Number.isFinite(measurement.signedErrorMs) ||
      measurement.signedErrorMs !==
        measurement.actualTimeMs - measurement.expectedTimeMs ||
      measurement.absoluteErrorMs !== Math.abs(measurement.signedErrorMs)
    ) fail();
    seenTiming.add(key);
    entries.target.timing = { ...measurement };
    entries.actual.timing = { ...measurement };
  }
  const counts = {
    missing: errors.filter((item) => item.classification === "missing").length,
    extra: errors.filter((item) => item.classification === "extra").length,
    initialStateErrors:
      errors.filter((item) => item.classification === "initial-state-error")
        .length,
    measuredCount: seenTiming.size,
  };
  if (
    counts.missing !== matching.missing || counts.extra !== matching.extra ||
    sample.filter((item) => item.status === "matched").length !==
      matching.matched ||
    you.length !== matching.actualCount ||
    seenTiming.size !== timingTargets.size ||
    seenTiming.size !== timing.measuredCount
  ) fail();
  return { sample, you, errors, counts };
}
