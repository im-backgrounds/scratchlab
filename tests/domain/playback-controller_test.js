import assert from "node:assert/strict";
import { createPlaybackController } from "../../src/domain/playback-controller.js";

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

Deno.test("controller starts immediately, ticks, and stops cleanly", async () => {
  const controller = createPlaybackController();
  let ticks = 0;

  controller.start(10, () => {
    ticks += 1;
  });
  assert.equal(controller.isRunning, true);
  assert.equal(ticks, 1);

  await wait(35);
  assert.ok(ticks >= 2);
  controller.stop();
  assert.equal(controller.isRunning, false);

  const ticksAtStop = ticks;
  await wait(25);
  assert.equal(ticks, ticksAtStop);
});

Deno.test("restarting replaces the previous interval without stopping playback", async () => {
  const controller = createPlaybackController();
  let ticks = 0;
  const onTick = () => {
    ticks += 1;
  };

  controller.start(20, onTick);
  controller.start(1000, onTick);
  assert.equal(controller.isRunning, true);
  assert.equal(ticks, 2);

  await wait(35);
  assert.equal(ticks, 2);
  controller.stop();
});
