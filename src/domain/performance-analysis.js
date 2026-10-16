import { COUNT_KEYS } from "./performance.js";

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
 * Compares a recorded performance with the expected events by sequence only.
 * The scratch lane (forward/backward/stop) and the fader lane are aligned
 * separately, so the order between a fader change and a scratch that happen
 * together does not matter. Timing is ignored.
 * @param {object[]} expectedEvents Output of createExpectedEvents.
 * @param {object[]} actualEvents Events of a performance.
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
