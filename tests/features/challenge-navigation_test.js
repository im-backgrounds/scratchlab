import assert from "node:assert/strict";
import {
  createChallengeNavigation,
} from "../../src/features/challenge-navigation.js";

function createFixture(isRunning) {
  const calls = [];
  const dialog = {
    open: false,
    showModal() {
      this.open = true;
      calls.push("show");
    },
    close() {
      this.open = false;
      calls.push("close");
    },
  };
  const navigation = createChallengeNavigation({
    dialog,
    isChallengeRunning: () => isRunning,
    beforeSwitch: () => calls.push("prepare"),
    onConfirmedInterruption: () => calls.push("interrupted"),
  });
  return { calls, dialog, navigation };
}

Deno.test("navigation proceeds directly when no challenge is running", () => {
  const { calls, navigation } = createFixture(false);
  navigation.navigate(() => calls.push("navigate"));
  assert.deepEqual(calls, ["prepare", "navigate"]);
});

Deno.test("active challenge navigation waits for confirmation", () => {
  const { calls, dialog, navigation } = createFixture(true);
  navigation.navigate(() => calls.push("navigate"));
  assert.equal(dialog.open, true);
  assert.deepEqual(calls, ["show"]);
});

Deno.test("dismissing the dialog keeps the challenge and cancels navigation", () => {
  const { calls, dialog, navigation } = createFixture(true);
  navigation.navigate(() => calls.push("navigate"));
  navigation.dismiss();
  assert.equal(dialog.open, false);
  assert.deepEqual(calls, ["show", "close"]);
});

Deno.test("confirmation prepares, navigates, then reports the interruption", () => {
  const { calls, dialog, navigation } = createFixture(true);
  navigation.navigate(() => calls.push("navigate"));
  navigation.confirm();
  assert.equal(dialog.open, false);
  assert.deepEqual(calls, [
    "show",
    "close",
    "prepare",
    "navigate",
    "interrupted",
  ]);
});

Deno.test("chart changes do not repeat page preparation on confirmation", () => {
  const { calls, navigation } = createFixture(true);
  navigation.navigate(
    () => calls.push("navigate"),
    { prepare: false },
  );
  navigation.confirm();
  assert.deepEqual(calls, ["show", "close", "navigate", "interrupted"]);
});
