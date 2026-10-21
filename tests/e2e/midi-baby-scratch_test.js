import assert from "node:assert/strict";
import {
  connectAndMapMidi,
  createE2ETestEnvironment,
  sendMidi,
} from "./midi/environment.js";

// Independent performance fixture: Baby Scratch has two 4/4 bars at 80 BPM.
const beatMs = 750;
const loopMs = beatMs * 8;
const strokes = [60, 61, 60, 61, 60, 61, 60, 61];

Deno.test("Baby Scratch: virtual MIDI through the real Challenge result", async (t) => {
  const environment = await createE2ETestEnvironment();
  const { page, errors, warnings } = environment;
  const text = (selector) => page.locator(selector).textContent();
  const progress = (id) =>
    page.locator(`#challenge-progress [data-id="${id}"]`).getAttribute(
      "data-state",
    );
  const step = async (name, run) => {
    assert.ok(await t.step(name, run), `E2E prerequisite failed: ${name}`);
  };
  try {
    await step(
      "MIDI Access: connect a virtual device and Learn real mappings",
      async () => {
        await connectAndMapMidi(page);
        assert.equal(await text("#midi-status"), "MIDI接続済み");
        assert.equal(
          await page.evaluate(() => globalThis.__midiAccessRequests),
          1,
        );
        const mappings = await page.locator(".midi-mapping-value")
          .allTextContents();
        assert.match(mappings[0], /Note 60/);
        assert.match(mappings[1], /Note 61/);
        assert.match(mappings[2], /CC 7/);
      },
    );

    await step(
      "MIDI Input: messages reach the application's handler",
      async () => {
        await sendMidi(page, [0x90, 60, 127]);
        assert.match(
          await text("#midi-log"),
          /status=144, note=60, velocity=127/,
        );
        assert.match(await text("#midi-performance-log"), /scratch forward/);
        await page.locator("#chart-list button").filter({
          hasText: "Baby Scratch",
        })
          .click();
        assert.equal(await text("#chart-title"), "Baby Scratch");
        await sendMidi(page, [0xb0, 7, 0]);
      },
    );

    await step(
      "Recording: demo is unscored, then two live MIDI takes",
      async () => {
        assert.equal(await text("#challenge-current-bpm"), "80");
        await page.locator("#challenge-start").click();
        assert.equal(await progress("demo"), "current");
        await sendMidi(page, [0x90, 61, 127]);
        await page.clock.runFor(loopMs);
        assert.equal(await progress("recording-1"), "current");
        assert.equal(
          await page.locator("#performance-panel").getAttribute("class")
            .then((value) => value.includes("is-recording")),
          true,
        );
        for (let take = 1; take <= 2; take++) {
          await page.evaluate(({ beatMs, strokes }) => {
            const start = performance.now();
            globalThis.__midi.sendMany(strokes.map((note, index) => ({
              timestamp: start + index * beatMs,
              data: [0x90, note, 127],
            })));
          }, { beatMs, strokes });
          await page.clock.runFor(loopMs);
          assert.equal(
            await progress(take === 1 ? "recording-2" : "analyzing"),
            "current",
          );
        }
        await page.clock.runFor(400);
        assert.equal(await progress("result"), "done");
        const recording = await page.evaluate(() =>
          JSON.parse(localStorage.getItem("scratchlab.performance")).performance
        );
        const movement = recording.events.filter((event) =>
          event.type === "scratch" && event.direction !== "stop"
        );
        assert.equal(movement.length, 16);
        assert.deepEqual(
          movement.map((event) => event.direction),
          Array.from(
            { length: 16 },
            (_, index) => index % 2 ? "backward" : "forward",
          ),
        );
        assert.deepEqual(
          movement.map((event) => event.t),
          Array.from({ length: 16 }, (_, index) => index * beatMs),
        );
        assert.equal(recording.durationMs, loopMs * 2);
        assert.equal(
          await page.locator(
            "#performance-timeline .performance-segment-forward",
          ).count(),
          8,
        );
        assert.equal(
          await page.locator(
            "#performance-timeline .performance-segment-backward",
          ).count(),
          8,
        );
      },
    );

    await step("Matching: Accuracy 100%, Missing 0, Extra 0", async () => {
      assert.equal(await text("#performance-accuracy"), "100.0%");
      assert.equal(await text(".performance-analysis-matched dd"), "16");
      assert.equal(await text(".performance-analysis-missing dd"), "0");
      assert.equal(await text(".performance-analysis-extra dd"), "0");
    });

    await step(
      "Timing: actual matched MIDI events provide measurements",
      async () => {
        assert.equal(
          await page.locator("#challenge-timing-analysis").isVisible(),
          true,
        );
        const measuredCount = Number(await text("#challenge-measured-count"));
        assert.ok(measuredCount > 0);
        assert.equal(measuredCount, 16);
        assert.equal(await text("#challenge-average-error"), "0.0 ms");
        assert.equal(await text("#challenge-max-error"), "0.0 ms");
        assert.equal(await text("#challenge-timing-accuracy"), "100.0%");
      },
    );

    await step(
      "Overlay: SAMPLE/YOU/ERROR share Matching and Timing totals",
      async () => {
        assert.equal(
          await page.locator(".controller-overlay-event-sample").count(),
          16,
        );
        assert.equal(
          await page.locator(".controller-overlay-event-you").count(),
          16,
        );
        assert.equal(
          await page.locator(".controller-overlay-event-error").count(),
          0,
        );
        assert.match(
          await text(".controller-overlay-status"),
          /Missing 0件 \/ Extra 0件 \/ Initial State Error 0件 \/ Timing 16件/,
        );
        for (
          const lane of await page.locator(".controller-overlay-lane-you").all()
        ) {
          const markers = lane.locator(".controller-overlay-event-you");
          if (await markers.count() === 0) continue;
          assert.deepEqual(await markers.allTextContents(), [
            "F",
            "B",
            "F",
            "B",
            "F",
            "B",
            "F",
            "B",
          ]);
          assert.deepEqual(
            await markers.evaluateAll((items) =>
              items.map((item) => item.style.left)
            ),
            ["0%", "12.5%", "25%", "37.5%", "50%", "62.5%", "75%", "87.5%"],
          );
        }
      },
    );

    await step(
      "Challenge / Result: cleared at 100%, next BPM is 85",
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
        const performanceDetails = page.locator(
          "#challenge-performance-details",
        );
        assert.equal(await performanceDetails.isVisible(), true);
        await performanceDetails.click();
        assert.equal(
          await page.evaluate(() =>
            document.activeElement?.id === "performance-title"
          ),
          true,
        );
      },
    );

    await step(
      "Isolation: no Ghost or Replay storage, no browser errors",
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
});
