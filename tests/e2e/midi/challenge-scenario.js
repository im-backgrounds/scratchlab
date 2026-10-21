import assert from "node:assert/strict";
import {
  connectAndMapMidi,
  createE2ETestEnvironment,
  sendMidi,
} from "./environment.js";

const loopMs = 6000;
const kind = (event) =>
  event.type === "scratch"
    ? event.direction
    : event.state === "open"
    ? "faderOpen"
    : "faderClosed";

/**
 * Independent physical gestures at 80 BPM, not compiled chart/Replay data.
 * Keepalive motion prevents the real 150ms Stop observer from splitting a
 * sustained stroke when only the fader is being operated.
 */
function createInput({ strokes, cuts }) {
  const meaning = [
    ...strokes.map(([t, note]) => ({
      t,
      type: "scratch",
      direction: note === 60 ? "forward" : "backward",
    })),
    ...cuts.flatMap((t) => [
      { t: Math.round(t), type: "fader", state: "closed" },
      { t: Math.round(t), type: "fader", state: "open" },
    ]),
  ].toSorted((a, b) => a.t - b.t);
  const movement = strokes.flatMap(([start, note], index) => {
    const end = strokes[index + 1]?.[0] ?? loopMs;
    const messages = [];
    for (let t = start; t < end; t += 100) {
      messages.push({ t, data: [0x90, note, 127] });
    }
    return messages;
  });
  const messages = [
    ...movement,
    ...cuts.flatMap((t) => [
      { t: Math.round(t), data: [0xb0, 7, 127] },
      { t: Math.round(t), data: [0xb0, 7, 0] },
    ]),
  ].toSorted((a, b) => a.t - b.t);
  return { meaning, messages };
}

export async function runMidiChallengeScenario(t, scenario) {
  const { meaning, messages } = createInput(scenario);
  const counts = Object.fromEntries(
    ["forward", "backward", "faderOpen", "faderClosed"].map((name) => [
      name,
      meaning.filter((event) => kind(event) === name).length * 2,
    ]),
  );
  assert.deepEqual(counts, scenario.counts);
  const total = meaning.length * 2;
  const environment = await createE2ETestEnvironment();
  const { page, errors, warnings } = environment;
  const text = (selector) => page.locator(selector).textContent();
  const progress = (id) =>
    page.locator(`#challenge-progress [data-id="${id}"]`)
      .getAttribute("data-state");
  const step = async (name, run) => {
    assert.ok(await t.step(name, run), `E2E prerequisite failed: ${name}`);
  };
  try {
    await step(
      "MIDI Input: real Learn mapping and Scratch/Fader delivery",
      async () => {
        await connectAndMapMidi(page);
        assert.equal(await text("#midi-status"), "MIDI接続済み");
        await sendMidi(page, [0x90, 60, 127]);
        assert.match(
          await text("#midi-log"),
          /status=144, note=60, velocity=127/,
        );
        assert.match(await text("#midi-performance-log"), /scratch forward/);
        await sendMidi(page, [0xb0, 7, 127]);
        assert.match(
          await text("#midi-log"),
          /status=176, note=7, velocity=127/,
        );
        assert.match(await text("#midi-performance-log"), /fader closed/);
        await sendMidi(page, [0xb0, 7, 0]);
        assert.match(await text("#midi-performance-log"), /fader open/);
        await page.locator("#chart-list button")
          .filter({ hasText: scenario.name }).click();
        assert.equal(await text("#chart-title"), scenario.name);
        await sendMidi(page, [0xb0, 7, 0]);
      },
    );

    await step(
      "Recording: warmup excluded; laps 2 and 3 record meaning events",
      async () => {
        assert.equal(await page.locator("#challenge-retry").count(), 0);
        assert.equal(await text("#challenge-current-bpm"), "80");
        await page.locator("#challenge-start").click();
        assert.equal(await progress("warmup"), "current");
        await sendMidi(page, [0x90, 61, 127]);
        await page.clock.runFor(loopMs);
        assert.equal(await progress("recording-2"), "current");
        for (let take = 1; take <= 2; take++) {
          await page.evaluate((messages) => {
            const start = performance.now();
            globalThis.__midi.sendMany(messages.map(({ t, data }) => ({
              timestamp: start + t,
              data,
            })));
          }, messages);
          await page.clock.runFor(loopMs);
          assert.equal(
            await progress(take === 1 ? "recording-3" : "analyzing"),
            "current",
          );
        }
        assert.equal(await text("#play-toggle"), "再生");
        await page.clock.runFor(400);
        assert.equal(await progress("completed"), "done");
        const recording = await page.evaluate(() =>
          JSON.parse(localStorage.getItem("scratchlab.performance")).performance
        );
        assert.equal(recording.durationMs, loopMs * 2);
        const actual = recording.events.filter((event) =>
          event.type === "fader" ||
          (event.type === "scratch" && event.direction !== "stop")
        );
        assert.deepEqual(
          actual,
          [0, loopMs].flatMap((offset) =>
            meaning.map((event) => ({ ...event, t: offset + event.t }))
          ),
        );
        for (const [name, count] of Object.entries(counts)) {
          assert.ok(count > 0);
          assert.equal(
            recording.counts[name],
            count,
            `${name} recording count`,
          );
        }
        assert.match(
          await text("#performance-status"),
          new RegExp(`受信${messages.length * 2}件`),
        );
      },
    );

    await step(
      "Challenge Start restarts after results without showing stale analysis",
      async () => {
        await page.locator("#challenge-start").click();
        assert.equal(await progress("warmup"), "current");
        assert.equal(
          await page.locator("#challenge-timing-analysis").isVisible(),
          false,
        );
        assert.equal(
          await page.locator("#performance-summary-export").isDisabled(),
          true,
        );
        await page.clock.runFor(loopMs);
        assert.equal(await progress("recording-2"), "current");
      },
    );

    await step(
      "Matching / Timing: 100%, Missing 0, Extra 0, measured pairs",
      async () => {
        assert.equal(await text("#performance-accuracy"), "100.0%");
        assert.equal(
          await text(".performance-analysis-matched dd"),
          String(total),
        );
        assert.equal(await text(".performance-analysis-missing dd"), "0");
        assert.equal(await text(".performance-analysis-extra dd"), "0");
        assert.equal(
          await page.locator("#challenge-timing-analysis").isVisible(),
          true,
        );
        assert.equal(Number(await text("#challenge-measured-count")), total);
        // Fractional cut times are rounded to the browser timer's integer ms.
        for (
          const selector of ["#challenge-average-error", "#challenge-max-error"]
        ) {
          const error = Number.parseFloat(await text(selector));
          assert.ok(
            Number.isFinite(error) && error >= 0 && error <= 1,
            selector,
          );
        }
        assert.ok(
          Number.parseFloat(await text("#challenge-timing-accuracy")) >= 99,
        );
      },
    );

    await step(
      "Overlay: exact Scratch/Fader markers, positions and shared totals",
      async () => {
        assert.equal(
          await page.locator(".controller-overlay-event-sample").count(),
          total,
        );
        assert.equal(
          await page.locator(".controller-overlay-event-you").count(),
          total,
        );
        assert.equal(
          await page.locator(".controller-overlay-event-error").count(),
          0,
        );
        assert.match(
          await text(".controller-overlay-status"),
          new RegExp(
            `Missing 0件 / Extra 0件 / Initial State Error 0件 / Timing ${total}件`,
          ),
        );
        const symbols = {
          forward: "F",
          backward: "B",
          faderOpen: "O",
          faderClosed: "C",
        };
        for (const source of ["sample", "you"]) {
          const lanes = await page.locator(`.controller-overlay-lane-${source}`)
            .all();
          assert.equal(lanes.length, 4);
          for (let index = 0; index < lanes.length; index++) {
            const expected = meaning.filter((event) =>
              event.type === (index % 2 === 0 ? "scratch" : "fader")
            );
            const markers = lanes[index].locator(
              `.controller-overlay-event-${source}`,
            );
            assert.deepEqual(
              await markers.allTextContents(),
              expected.map((event) => symbols[kind(event)]),
            );
            const positions = await markers.evaluateAll((items) =>
              items.map((item) => Number.parseFloat(item.style.left))
            );
            positions.forEach((position, eventIndex) => {
              assert.ok(
                Math.abs(position - expected[eventIndex].t / loopMs * 100) <=
                  0.02,
                `${source} lane ${index} marker ${eventIndex}: ${position}`,
              );
            });
          }
        }
      },
    );

    await step(
      "Challenge Result: cleared at 100%, advances to 85 BPM",
      async () => {
        assert.match(
          await text("#challenge-status"),
          /80 BPM クリア！ 一致率 100\.0%/,
        );
        assert.equal(await text("#challenge-attempts"), "1");
        assert.equal(await text("#challenge-clears"), "1");
        assert.equal(await text("#challenge-highest-bpm"), "80");
        assert.equal(await text("#challenge-current-bpm"), "85");
        assert.equal(await text("#challenge-last-attempt-accuracy"), "100.0%");
        assert.equal(await text("#challenge-last-attempt-result"), "成功");
        assert.equal(
          await page.locator("#challenge-last-attempt").isVisible(),
          true,
        );
      },
    );

    await step(
      "Isolation: Ghost/Replay disabled, no unexpected browser errors",
      async () => {
        assert.deepEqual(
          await page.evaluate(() => [
            localStorage.getItem("scratchlab.ghost"),
            localStorage.getItem("scratchlab.replay"),
          ]),
          [null, null],
        );
        assert.deepEqual(errors, []);
        assert.deepEqual(warnings, [
          "Ghost Best Run could not be saved: e2e-disabled",
          "Challenge Replay could not be saved: e2e-disabled",
        ]);
      },
    );
  } finally {
    await environment.close();
  }
}
