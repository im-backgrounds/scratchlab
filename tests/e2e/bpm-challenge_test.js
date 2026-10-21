import assert from "node:assert/strict";
import {
  connectAndMapMidi,
  createE2ETestEnvironment,
  sendMidi,
} from "./midi/environment.js";

// Independent Baby Scratch gestures: eight alternating strokes per lap.
// Keep the fractional beat at 85 BPM; input timestamps are not chart-derived.
const attempts = [
  { bpm: 80, beatMs: 750, inputDelayMs: 0 },
  { bpm: 85, beatMs: 60000 / 85, inputDelayMs: 20 },
];
const progressIds = [
  "warmup",
  "recording-2",
  "recording-3",
  "analyzing",
  "completed",
];

Deno.test("BPM Challenge: complete two independent attempts from start to next action", async (t) => {
  const environment = await createE2ETestEnvironment();
  const { page, errors, warnings } = environment;
  const text = (id) => page.locator(`#${id}`).textContent();
  const stored = (key) =>
    page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
  const step = async (name, run) => {
    assert.ok(await t.step(name, run), `E2E prerequisite failed: ${name}`);
  };
  const assertPhase = async (id) => {
    const index = progressIds.indexOf(id);
    assert.deepEqual(
      await page.locator("#challenge-progress [data-id]").evaluateAll(
        (items) =>
          items.map((item) => [
            item.getAttribute("data-id"),
            item.getAttribute("data-state"),
            item.getAttribute("aria-current"),
          ]),
      ),
      progressIds.map((stepId, stepIndex) => [
        stepId,
        stepIndex < index || id === "completed"
          ? "done"
          : stepIndex === index
          ? "current"
          : "pending",
        stepIndex === index && id !== "completed" ? "step" : null,
      ]),
    );
    const running = id !== "completed";
    assert.equal(await page.locator("#challenge-start").isDisabled(), running);
    assert.equal(await page.locator("#challenge-reset").isDisabled(), running);
    assert.equal(await page.locator("#bpm-slider").isDisabled(), running);
    assert.equal(
      await page.locator("#performance-panel").evaluate((panel) =>
        panel.classList.contains("is-recording")
      ),
      id === "recording-2" || id === "recording-3",
    );
    assert.equal(
      await text("play-toggle"),
      id === "analyzing" || id === "completed" ? "再生" : "停止",
    );
  };
  let previousRecording = null;
  let previousProgress = null;
  try {
    await step("Prepare real MIDI mappings and open Baby Scratch", async () => {
      await connectAndMapMidi(page);
      await page.locator("#chart-list button").filter({
        hasText: "Baby Scratch",
      }).click();
      assert.equal(await text("chart-title"), "Baby Scratch");
      assert.equal(await page.locator("#challenge-panel").isVisible(), true);
      assert.equal(
        await page.locator("#challenge-last-attempt").isVisible(),
        false,
      );
      assert.equal(await stored("scratchlab.performance"), null);
      assert.equal(await stored("scratchlab.challenge"), null);
    });

    for (
      const [attemptIndex, { bpm, beatMs, inputDelayMs }] of attempts.entries()
    ) {
      const loopMs = beatMs * 8;
      const count = attemptIndex + 1;
      const timestampTolerance = bpm === 80 ? 0 : 1;
      let startedAt;
      const beforeBoundary = async (lap) => {
        const remaining = await page.evaluate(
          (target) => target - Date.now(),
          Math.ceil(startedAt + lap * loopMs) - 1,
        );
        // runFor rounds up, so advance to absolute integer targets, not rounded laps.
        await page.clock.runFor(remaining);
      };
      const expectedStrokes = Array.from({ length: 16 }, (_, index) => ({
        t: index * beatMs + inputDelayMs,
        type: "scratch",
        direction: index % 2 ? "backward" : "forward",
      }));

      await step(`${bpm} BPM: start and exclude all warmup input`, async () => {
        await sendMidi(page, [0xb0, 7, 0]);
        assert.equal(await text("challenge-current-bpm"), String(bpm));
        await page.locator("#challenge-start").click();
        startedAt = await page.evaluate(() => Date.now());
        await assertPhase("warmup");
        assert.equal(
          await page.locator("#challenge-timing-analysis").isVisible(),
          false,
        );
        assert.equal(
          await page.locator("#performance-summary-export").isDisabled(),
          true,
        );
        assert.equal(
          await page.locator("#challenge-performance-details").isVisible(),
          false,
        );
        // Deliberately wrong warmup gestures must not leak into either take.
        await sendMidi(page, [0x90, 61, 127]);
        await sendMidi(page, [0xb0, 7, 127]);
        await beforeBoundary(1);
        await sendMidi(page, [0xb0, 7, 0]);
        await assertPhase("warmup");
        assert.deepEqual(
          await stored("scratchlab.performance"),
          previousRecording,
        );
        assert.deepEqual(
          await stored("scratchlab.challenge"),
          previousProgress,
        );
        await page.clock.runFor(1);
        await assertPhase("recording-2");
      });

      for (const lap of [2, 3]) {
        await step(
          `${bpm} BPM: record lap ${lap} through its exact boundary`,
          async () => {
            await page.evaluate(({ beatMs, inputDelayMs }) => {
              const start = performance.now();
              globalThis.__midi.sendMany(
                Array.from({ length: 8 }, (_, index) => ({
                  timestamp: start + index * beatMs + inputDelayMs,
                  data: [0x90, index % 2 ? 61 : 60, 127],
                })),
              );
            }, { beatMs, inputDelayMs });
            await beforeBoundary(lap);
            await assertPhase(`recording-${lap}`);
            assert.deepEqual(
              await stored("scratchlab.challenge"),
              previousProgress,
            );
            await page.clock.runFor(1);
            await assertPhase(lap === 2 ? "recording-3" : "analyzing");
          },
        );
      }

      await step(
        `${bpm} BPM: stop recording before analysis and persist only laps 2–3`,
        async () => {
          const recording = await stored("scratchlab.performance");
          assert.ok(
            Math.abs(recording.performance.durationMs - loopMs * 2) <=
              timestampTolerance,
          );
          assert.equal(recording.performance.loopEnds.length, 1);
          assert.ok(
            Math.abs(recording.performance.loopEnds[0] - loopMs) <=
              timestampTolerance,
          );
          assert.equal(recording.performance.truncated, false);
          const movement = recording.performance.events.filter((event) =>
            event.type === "scratch" && event.direction !== "stop"
          );
          assert.equal(movement.length, expectedStrokes.length);
          movement.forEach((event, index) => {
            const expected = expectedStrokes[index];
            assert.equal(event.type, expected.type);
            assert.equal(event.direction, expected.direction);
            assert.ok(
              Math.abs(event.t - expected.t) <= timestampTolerance,
              `stroke ${index} offset: ${event.t}, expected ${expected.t}`,
            );
          });
          assert.equal(recording.performance.counts.forward, 8);
          assert.equal(recording.performance.counts.backward, 8);
          assert.equal(recording.performance.counts.faderOpen, 0);
          assert.equal(recording.performance.counts.faderClosed, 0);
          assert.ok(
            recording.performance.events.every((event) =>
              event.t >= 0 && event.t < recording.performance.durationMs
            ),
          );
          if (previousRecording) {
            assert.notEqual(
              recording.performance.startedAt,
              previousRecording.performance.startedAt,
            );
            assert.notDeepEqual(
              recording.performance.events,
              previousRecording.performance.events,
            );
          }
          // Input at the exclusive end of lap 3 must not alter the finished take.
          await sendMidi(page, [0x90, 60, 127]);
          await sendMidi(page, [0xb0, 7, 127]);
          await page.clock.runFor(399);
          await assertPhase("analyzing");
          assert.deepEqual(await stored("scratchlab.performance"), recording);
          assert.deepEqual(
            await stored("scratchlab.challenge"),
            previousProgress,
          );
          await page.clock.runFor(1);
          await assertPhase("completed");
          previousRecording = recording;
        },
      );

      await step(
        `${bpm} BPM: show fresh scoring, result and working next actions`,
        async () => {
          assert.equal(await text("performance-accuracy"), "100.0%");
          assert.equal(
            await page.locator(".performance-analysis-matched dd")
              .textContent(),
            "16",
          );
          assert.equal(
            await page.locator(".performance-analysis-missing dd")
              .textContent(),
            "0",
          );
          assert.equal(
            await page.locator(".performance-analysis-extra dd").textContent(),
            "0",
          );
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
            await page.locator(".controller-overlay-status").textContent(),
            /Missing 0件 \/ Extra 0件 \/ Initial State Error 0件 \/ Timing 16件/,
          );
          assert.equal(await text("challenge-last-attempt-accuracy"), "100.0%");
          assert.equal(await text("challenge-last-attempt-bpm"), String(bpm));
          assert.equal(await text("challenge-last-attempt-result"), "成功");
          assert.equal(await text("challenge-attempts"), String(count));
          assert.equal(await text("challenge-clears"), String(count));
          assert.equal(await text("challenge-highest-bpm"), String(bpm));
          assert.equal(await text("challenge-current-bpm"), String(bpm + 5));
          assert.match(
            await text("challenge-status"),
            new RegExp(`${bpm} BPM クリア！ 一致率 100\\.0%`),
          );
          assert.equal(
            await page.locator("#challenge-last-attempt").isVisible(),
            true,
          );
          assert.equal(
            await page.locator("#challenge-timing-analysis").isVisible(),
            true,
          );
          assert.equal(await text("challenge-measured-count"), "16");
          const averageError = Number.parseFloat(
            await text("challenge-average-error"),
          );
          assert.ok(Number.isFinite(averageError));
          if (inputDelayMs === 0) assert.equal(averageError, 0);
          else assert.ok(averageError >= 10 && averageError < 30);
          assert.equal(
            await page.locator("#performance-summary-export").isEnabled(),
            true,
          );
          const details = page.locator("#challenge-performance-details");
          assert.equal(await details.isVisible(), true);
          await details.click();
          assert.equal(
            await page.locator("#performance-title").evaluate(
              (title) => document.activeElement === title,
            ),
            true,
          );
          assert.equal(
            await page.locator("#performance-accuracy").isVisible(),
            true,
          );
          const progress = await stored("scratchlab.challenge");
          const entries = Object.values(progress.charts);
          assert.equal(entries.length, 1);
          assert.equal(entries[0].attempts, count);
          assert.equal(entries[0].clears, count);
          assert.equal(entries[0].highestClearedBpm, bpm);
          assert.equal(entries[0].lastAttempt.bpm, bpm);
          assert.equal(entries[0].lastAttempt.accuracy, 100);
          assert.equal(entries[0].lastAttempt.cleared, true);
          assert.equal(entries[0].lastAttempt.valid, true);
          previousProgress = progress;
        },
      );
    }

    await step(
      "No browser errors or unexpected integration side effects",
      async () => {
        assert.deepEqual(errors, []);
        assert.deepEqual(
          warnings,
          attempts.flatMap(() => [
            "Ghost Best Run could not be saved: e2e-disabled",
            "Challenge Replay could not be saved: e2e-disabled",
          ]),
        );
        assert.equal(await stored("scratchlab.ghost"), null);
        assert.equal(await stored("scratchlab.replay"), null);
      },
    );
  } finally {
    await environment.close();
  }
});
