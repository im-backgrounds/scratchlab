import assert from "node:assert/strict";
import { renderChallenge } from "../../src/ui/challenge.js";
import { focusPerformanceDetails } from "../../src/ui/performance.js";

Deno.test("Performance details link reflects current analysis availability", () => {
  const calls = [];
  const elements = new Map();
  const documentMock = {
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, {
          classList: { toggle() {} },
          focus: (options) => calls.push(["focus", options]),
          scrollIntoView: (options) => calls.push(["scroll", options]),
        });
      }
      return elements.get(id);
    },
  };
  const previousDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    "document",
  );
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: documentMock,
  });

  try {
    const view = {
      active: false,
      currentBpm: 80,
      highestClearedBpm: null,
      bestAccuracy: null,
      attempts: 0,
      clears: 0,
      canStart: true,
      canReset: false,
      lastAttempt: {
        bpm: 80,
        accuracy: 95,
        cleared: true,
        at: "2026-10-21T00:00:00.000Z",
      },
    };

    renderChallenge(view, "Baby Scratch", false);
    assert.equal(
      documentMock.getElementById("challenge-performance-details").hidden,
      true,
    );

    renderChallenge(view, "Baby Scratch", true);
    assert.equal(
      documentMock.getElementById("challenge-performance-details").hidden,
      false,
    );

    renderChallenge({ ...view, lastAttempt: null }, "Baby Scratch", true);
    assert.equal(
      documentMock.getElementById("challenge-performance-details").hidden,
      true,
    );

    focusPerformanceDetails();
    assert.deepEqual(calls, [
      ["scroll", { behavior: "smooth", block: "start" }],
      ["focus", { preventScroll: true }],
    ]);
  } finally {
    if (previousDocument) {
      Object.defineProperty(globalThis, "document", previousDocument);
    } else {
      delete globalThis.document;
    }
  }
});
