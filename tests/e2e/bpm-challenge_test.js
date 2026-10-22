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

const challengeLoopMs = 6000;

async function prepareBabyScratchChallenge(page) {
  await connectAndMapMidi(page);
  await page.locator("#chart-list button").filter({
    hasText: "Baby Scratch",
  }).click();
  assert.equal(
    await page.locator("#chart-title").textContent(),
    "Baby Scratch",
  );
}

async function runChallengeAttempt(page, recordLoop = async () => undefined) {
  await page.locator("#challenge-start").click();
  await page.clock.runFor(challengeLoopMs);
  assert.equal(
    await page.locator('#challenge-progress [data-id="recording-2"]')
      .getAttribute("data-state"),
    "current",
  );
  for (let lap = 0; lap < 2; lap++) {
    await recordLoop(lap);
    await page.clock.runFor(challengeLoopMs);
  }
  assert.equal(
    await page.locator('#challenge-progress [data-id="analyzing"]')
      .getAttribute("data-state"),
    "current",
  );
  await page.clock.runFor(400);
  assert.equal(
    await page.locator('#challenge-progress [data-id="completed"]')
      .getAttribute("data-state"),
    "done",
  );
}

async function sendBabyScratchLap(
  page,
  intervalMs = 750,
  { faderMistake = false } = {},
) {
  await page.evaluate(({ intervalMs, faderMistake }) => {
    const start = performance.now();
    const messages = Array.from({ length: 8 }, (_, index) => ({
      timestamp: start + index * intervalMs,
      data: [0x90, index % 2 ? 61 : 60, 127],
    }));
    if (faderMistake) {
      messages.push(
        { timestamp: start + 150, data: [0xb0, 7, 127] },
        { timestamp: start + 300, data: [0xb0, 7, 0] },
      );
    }
    globalThis.__midi.sendMany(
      messages.toSorted((a, b) => a.timestamp - b.timestamp),
    );
  }, { intervalMs, faderMistake });
}

Deno.test("BPM Challenge: unknown and closed initial faders do not count", async () => {
  const environment = await createE2ETestEnvironment();
  const { page, errors, warnings } = environment;
  const stored = (key) =>
    page.evaluate((key) => localStorage.getItem(key), key);
  try {
    await prepareBabyScratchChallenge(page);
    assert.equal(await stored("scratchlab.challenge"), null);
    assert.equal(await stored("scratchlab.achievements"), null);
    assert.equal(await stored("scratchlab.beginner-course"), null);

    await runChallengeAttempt(page);
    assert.equal(
      await page.locator("#performance-accuracy").textContent(),
      "0.0%",
    );
    assert.match(
      await page.locator(".controller-overlay-status").textContent(),
      /Missing 16件 \/ Extra 0件 \/ Initial State Error 2件/,
    );
    assert.equal(
      await page.locator(".performance-analysis-missing dd").textContent(),
      "16",
    );
    assert.match(
      await page.locator("#challenge-status").textContent(),
      /初期フェーダーが未確認または閉じています/,
    );
    assert.equal(await page.locator("#challenge-attempts").textContent(), "0");
    assert.equal(
      await page.locator("#challenge-last-attempt").isVisible(),
      false,
    );
    assert.equal(await stored("scratchlab.challenge"), null);
    assert.equal(await stored("scratchlab.achievements"), null);
    assert.equal(await stored("scratchlab.beginner-course"), null);

    await sendMidi(page, [0xb0, 7, 127]);
    await runChallengeAttempt(page);
    assert.match(
      await page.locator("#challenge-status").textContent(),
      /初期フェーダーが未確認または閉じています/,
    );
    assert.match(
      await page.locator(".controller-overlay-status").textContent(),
      /Missing 16件 \/ Extra 0件 \/ Initial State Error 2件/,
    );
    assert.equal(await page.locator("#challenge-attempts").textContent(), "0");
    assert.equal(await stored("scratchlab.challenge"), null);
    assert.equal(await stored("scratchlab.achievements"), null);
    assert.equal(await stored("scratchlab.beginner-course"), null);
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, []);
  } finally {
    await environment.close();
  }
});

Deno.test("BPM Challenge: low score fails cleanly and a retry can clear", async () => {
  const environment = await createE2ETestEnvironment();
  const { page, errors, warnings } = environment;
  const stored = (key) =>
    page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
  try {
    await prepareBabyScratchChallenge(page);
    await sendMidi(page, [0xb0, 7, 0]);

    await runChallengeAttempt(page);
    const failedRecording = await stored("scratchlab.performance");
    assert.equal(failedRecording.performance.counts.forward, 0);
    assert.equal(failedRecording.performance.counts.backward, 0);
    assert.equal(
      await page.locator("#performance-accuracy").textContent(),
      "0.0%",
    );
    assert.equal(
      await page.locator(".performance-analysis-matched dd").textContent(),
      "0",
    );
    assert.equal(
      await page.locator(".performance-analysis-missing dd").textContent(),
      "16",
    );
    assert.equal(
      await page.locator(".performance-analysis-extra dd").textContent(),
      "0",
    );
    assert.equal(
      await page.locator("#challenge-last-attempt-accuracy").textContent(),
      "0.0%",
    );
    assert.equal(
      await page.locator("#challenge-last-attempt-result").textContent(),
      "失敗",
    );
    assert.match(
      await page.locator("#challenge-status").textContent(),
      /一致率 0\.0%。90%以上でクリアです。もう一度挑戦できます。/,
    );
    assert.equal(await page.locator("#challenge-attempts").textContent(), "1");
    assert.equal(await page.locator("#challenge-clears").textContent(), "0");
    assert.equal(
      await page.locator("#challenge-current-bpm").textContent(),
      "80",
    );
    assert.equal(
      await page.locator("#performance-summary-export").isEnabled(),
      true,
    );
    const failureProgress = await stored("scratchlab.challenge");
    const failureEntry = failureProgress.charts["builtin:baby-scratch"];
    assert.equal(failureEntry.attempts, 1);
    assert.equal(failureEntry.clears, 0);
    assert.equal(failureEntry.highestClearedBpm, null);
    assert.equal(failureEntry.lastAttempt.accuracy, 0);
    assert.equal(failureEntry.lastAttempt.cleared, false);
    assert.equal(failureEntry.lastAttempt.valid, true);
    assert.equal(Number.isFinite(failureEntry.lastAttempt.accuracy), true);
    assert.equal(await stored("scratchlab.ghost"), null);
    assert.equal(await stored("scratchlab.replay"), null);
    const achievements = await stored("scratchlab.achievements");
    assert.equal(achievements.sessions.length, 1);
    assert.deepEqual(achievements.earned, {});
    assert.equal(await stored("scratchlab.beginner-course"), null);
    assert.deepEqual(warnings, []);

    await page.locator("#challenge-start").click();
    assert.equal(
      await page.locator("#challenge-timing-analysis").isVisible(),
      false,
    );
    assert.equal(
      await page.locator("#performance-summary-export").isDisabled(),
      true,
    );
    await page.clock.runFor(challengeLoopMs);
    for (let lap = 0; lap < 2; lap++) {
      await sendBabyScratchLap(page);
      await page.clock.runFor(challengeLoopMs);
    }
    await page.clock.runFor(400);

    assert.equal(
      await page.locator("#performance-accuracy").textContent(),
      "100.0%",
    );
    assert.equal(
      await page.locator(".performance-analysis-missing dd").textContent(),
      "0",
    );
    assert.equal(await page.locator("#challenge-attempts").textContent(), "2");
    assert.equal(await page.locator("#challenge-clears").textContent(), "1");
    assert.equal(
      await page.locator("#challenge-last-attempt-result").textContent(),
      "成功",
    );
    const clearedRecording = await stored("scratchlab.performance");
    assert.equal(clearedRecording.performance.counts.forward, 8);
    assert.equal(clearedRecording.performance.counts.backward, 8);
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, [
      "Ghost Best Run could not be saved: e2e-disabled",
      "Challenge Replay could not be saved: e2e-disabled",
    ]);
  } finally {
    await environment.close();
  }
});

Deno.test("BPM Challenge: tempo drift lowers timing, not sequence accuracy", async () => {
  const environment = await createE2ETestEnvironment();
  const { page, errors, warnings } = environment;
  try {
    await prepareBabyScratchChallenge(page);
    await sendMidi(page, [0xb0, 7, 0]);

    await runChallengeAttempt(page, () => sendBabyScratchLap(page, 800));
    assert.equal(
      await page.locator("#challenge-current-bpm").textContent(),
      "85",
    );
    assert.equal(
      await page.locator("#performance-accuracy").textContent(),
      "100.0%",
    );
    assert.equal(
      await page.locator(".performance-analysis-matched dd").textContent(),
      "16",
    );
    assert.equal(
      await page.locator(".performance-analysis-missing dd").textContent(),
      "0",
    );
    assert.equal(
      await page.locator(".performance-analysis-extra dd").textContent(),
      "0",
    );
    assert.equal(
      await page.locator("#challenge-last-attempt-result").textContent(),
      "成功",
    );
    assert.match(
      await page.locator("#challenge-status").textContent(),
      /80 BPM クリア！ 一致率 100\.0%/,
    );
    const averageError = Number.parseFloat(
      await page.locator("#challenge-average-error").textContent(),
    );
    const timingAccuracy = Number.parseFloat(
      await page.locator("#challenge-timing-accuracy").textContent(),
    );
    assert.ok(Number.isFinite(averageError) && averageError > 100);
    assert.ok(Number.isFinite(timingAccuracy) && timingAccuracy < 1);
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, [
      "Ghost Best Run could not be saved: e2e-disabled",
      "Challenge Replay could not be saved: e2e-disabled",
    ]);
  } finally {
    await environment.close();
  }
});

Deno.test(
  "BPM Challenge: extra fader actions lower accuracy and fail",
  async () => {
    const environment = await createE2ETestEnvironment();
    const { page, errors, warnings } = environment;
    try {
      await prepareBabyScratchChallenge(page);
      await sendMidi(page, [0xb0, 7, 0]);

      await runChallengeAttempt(page, () =>
        sendBabyScratchLap(page, 750, { faderMistake: true })
      );
      assert.equal(
        await page.locator("#performance-accuracy").textContent(),
        "80.0%",
      );
      assert.equal(
        await page.locator(".performance-analysis-matched dd").textContent(),
        "16",
      );
      assert.equal(
        await page.locator(".performance-analysis-missing dd").textContent(),
        "0",
      );
      assert.equal(
        await page.locator(".performance-analysis-extra dd").textContent(),
        "4",
      );
      assert.match(
        await page.locator(".controller-overlay-status").textContent(),
        /Missing 0件 \/ Extra 4件 \/ Initial State Error 0件/,
      );
      assert.equal(
        await page.locator("#challenge-last-attempt-accuracy").textContent(),
        "80.0%",
      );
      assert.equal(
        await page.locator("#challenge-last-attempt-result").textContent(),
        "失敗",
      );
      assert.match(
        await page.locator("#challenge-status").textContent(),
        /一致率 80\.0%。90%以上でクリアです。もう一度挑戦できます。/,
      );
      assert.equal(await page.locator("#challenge-attempts").textContent(), "1");
      assert.equal(await page.locator("#challenge-clears").textContent(), "0");
      assert.equal(await page.locator("#challenge-start").isEnabled(), true);
      assert.deepEqual(errors, []);
      assert.deepEqual(warnings, []);
    } finally {
      await environment.close();
    }
  },
);
