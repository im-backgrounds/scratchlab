import assert from "node:assert/strict";
import { renderControllerOverlay } from "../../src/ui/performance.js";
import { compileScoreData } from "../../src/domain/score-compiler.js";
import { analyzeRuntimePerformance } from "../../src/features/performance-view.js";

function element() {
  return {
    children: [],
    className: "",
    textContent: "",
    style: { setProperty() {} },
    classList: { add() {} },
    setAttribute() {},
    append(...items) {
      this.children.push(...items);
    },
    replaceChildren() {
      this.children = [];
    },
  };
}

function withDocument(run) {
  const previous = globalThis.document;
  const container = element();
  globalThis.document = {
    createElement: element,
    getElementById: () => container,
  };
  try {
    run(container);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
}

const score = compileScoreData({
  name: "Ghost",
  beat: "4/4",
  score: [["F", "B"]],
});
const ghost = {
  events: ["forward", "backward", "faderOpen", "faderClosed"].map((
    kind,
    i,
  ) => ({
    kind,
    timeMs: i * 500,
    position: i / 4,
    loopIndex: 1,
  })),
};
const rows = (container) =>
  container.children.filter((item) =>
    item.className.includes("controller-overlay-lane ")
  );
const markers = (row) =>
  row.children[1].children.filter((item) =>
    item.className.includes("controller-overlay-event ")
  );

Deno.test("Controller Overlay without Ghost retains SAMPLE YOU ERROR and no GHOST row", () => {
  withDocument((container) => {
    renderControllerOverlay(score, null);
    assert.equal(rows(container).length, 6);
    assert.equal(
      rows(container).some((row) => row.className.endsWith("-ghost")),
      false,
    );
  });
});

Deno.test("Controller Overlay draws GHOST between SAMPLE and YOU with all four symbols", () => {
  withDocument((container) => {
    renderControllerOverlay(score, null, null, [], ghost);
    const rendered = rows(container);
    assert.deepEqual(
      rendered.map((row) => row.children[0].textContent.split(" · ")[0]),
      [
        "SAMPLE",
        "SAMPLE",
        "GHOST",
        "GHOST",
        "YOU",
        "YOU",
        "Error",
        "Error",
      ],
    );
    assert.deepEqual(
      rendered.slice(2, 4).flatMap(markers).map((item) => item.textContent),
      [
        "F",
        "B",
        "O",
        "C",
      ],
    );
    assert.deepEqual(
      rendered.slice(2, 4).flatMap(markers).map((item) => item.style.left),
      [
        "0%",
        "25%",
        "50%",
        "75%",
      ],
    );
    renderControllerOverlay(score, null);
    assert.equal(rows(container).length, 6);
  });
});

Deno.test("Ghost rendering preserves existing analysis rows, summary and input bundle", () => {
  const loop = {
    sessionId: "render",
    loopIndex: 1,
    phase: "recording",
    startTime: 1000,
    endTime: 3000,
    startDirection: "unknown",
    startFaderState: "open",
  };
  const bundle = analyzeRuntimePerformance(
    score,
    [
      { type: "scratch", direction: "forward", time: 1000 },
      { type: "fader", state: "closed", time: 2000 },
    ],
    [loop],
    120,
  );
  const before = structuredClone(bundle);
  withDocument((container) => {
    renderControllerOverlay(score, bundle);
    const existing = rows(container).map((row) => [
      row.className,
      markers(row).map((item) => [item.textContent, item.style.left]),
    ]);
    const summary = container.children.at(-1).textContent;
    renderControllerOverlay(score, bundle, null, [], ghost);
    assert.equal(container.children.at(-1).textContent, summary);
    const withoutGhost = rows(container).filter((row) =>
      !row.className.endsWith("-ghost")
    );
    assert.deepEqual(
      withoutGhost.map((
        row,
      ) => [
        row.className,
        markers(row).map((item) => [item.textContent, item.style.left]),
      ]),
      existing,
    );
    assert.deepEqual(bundle, before);
  });
});

Deno.test("Ghost rendering keeps separate loop positions instead of merging takes", () => {
  withDocument((container) => {
    renderControllerOverlay(score, null, null, [], {
      events: [
        ghost.events[0],
        { ...ghost.events[1], loopIndex: 2 },
      ],
    });
    const ghostRows = rows(container).filter((row) =>
      row.className.endsWith("-ghost")
    );
    assert.deepEqual(
      ghostRows.flatMap(markers).map((item) => item.textContent),
      ["F", "B"],
    );
    assert.deepEqual(
      container.children.filter((item) => item.textContent.startsWith("Loop "))
        .map((item) => item.textContent),
      ["Loop 1", "Loop 2"],
    );
  });
});
