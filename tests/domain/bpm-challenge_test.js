import assert from "node:assert/strict";
import { chartCatalog } from "../../src/data/chart-catalog.js";
import { compileScoreData } from "../../src/domain/score-compiler.js";
import {
  CHALLENGE_RULES,
  CHALLENGE_STORAGE_KEY,
  createChallengeRepository,
  createChartKey,
  createEmptyProgress,
  deriveCurrentBpm,
  describeChallenge,
  evaluateAttempt,
  getExpectedDurationMs,
  isChallengeComplete,
  isDurationValid,
  MAX_CHALLENGE_CHARTS,
  normalizeProgress,
  parseChallengeStore,
  SAVE_CHART_MESSAGE,
} from "../../src/domain/bpm-challenge.js";

const AT = "2026-10-16T14:00:00.000Z";
const KEY = "builtin:baby-scratch";

function createFakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

const attempt = (bpm, accuracy, overrides = {}) => ({
  bpm,
  accuracy,
  actualDurationMs: 10000,
  expectedDurationMs: 10000,
  at: AT,
  ...overrides,
});

const progressAt = (highestClearedBpm, extra = {}) => ({
  ...createEmptyProgress(),
  highestClearedBpm,
  clears: highestClearedBpm === null ? 0 : 1,
  attempts: highestClearedBpm === null ? 0 : 1,
  ...extra,
});

Deno.test("the approved rules are the defaults", () => {
  assert.equal(CHALLENGE_RULES.startBpm, 80);
  assert.equal(CHALLENGE_RULES.bpmStep, 5);
  assert.equal(CHALLENGE_RULES.passAccuracy, 90);
  assert.equal(CHALLENGE_RULES.durationTolerance, 1.2);
});

Deno.test("only builtin and saved charts get a progress key", () => {
  assert.equal(
    createChartKey({ type: "builtin", id: "baby-scratch" }),
    "builtin:baby-scratch",
  );
  assert.equal(createChartKey({ type: "saved", id: "abc" }), "saved:abc");
  assert.equal(createChartKey({ type: "draft", id: "abc" }), null);
  assert.equal(createChartKey({ type: "draft" }), null);
  assert.equal(createChartKey({ type: "saved", id: "" }), null);
  assert.equal(createChartKey({ type: "saved", id: null }), null);
  assert.equal(createChartKey(null), null);
});

Deno.test("the current BPM is derived from the highest cleared BPM", () => {
  assert.equal(deriveCurrentBpm(createEmptyProgress()), 80);
  assert.equal(deriveCurrentBpm(progressAt(80)), 85);
  assert.equal(deriveCurrentBpm(progressAt(175)), 180);
  assert.equal(deriveCurrentBpm(progressAt(180)), 180);
  assert.equal(isChallengeComplete(progressAt(175)), false);
  assert.equal(isChallengeComplete(progressAt(180)), true);
  assert.equal(isChallengeComplete(createEmptyProgress()), false);
});

Deno.test("progress never contains a currentBpm field", () => {
  assert.equal("currentBpm" in createEmptyProgress(), false);
  const { progress } = evaluateAttempt(
    createEmptyProgress(),
    attempt(80, 95),
  );
  assert.equal("currentBpm" in progress, false);
  assert.deepEqual(Object.keys(progress).sort(), [
    "attempts",
    "bestAccuracy",
    "clears",
    "highestClearedBpm",
    "lastAttempt",
  ]);
});

Deno.test("expected duration follows the chart length and BPM", () => {
  const chart = chartCatalog[0];
  const scoreData = compileScoreData(chart);
  // 2 bars of 4/4 = 8 beats; at 120 BPM that is 4 seconds
  assert.equal(getExpectedDurationMs(scoreData, 120), 4000);
  assert.equal(getExpectedDurationMs(scoreData, 60), 8000);
});

Deno.test("a take is valid up to 120% of the expected duration", () => {
  assert.equal(isDurationValid(12000, 10000), true);
  assert.equal(isDurationValid(12001, 10000), false);
  assert.equal(isDurationValid(1, 10000), true);
  assert.equal(isDurationValid(0, 10000), false);
  assert.equal(isDurationValid(NaN, 10000), false);
  assert.equal(isDurationValid(5000, 0), false);
});

Deno.test("reaching the pass accuracy clears the BPM", () => {
  const first = evaluateAttempt(createEmptyProgress(), attempt(80, 90));
  assert.deepEqual(first.result, {
    status: "counted",
    cleared: true,
    valid: true,
  });
  assert.deepEqual(first.progress, {
    highestClearedBpm: 80,
    attempts: 1,
    clears: 1,
    bestAccuracy: 90,
    lastAttempt: { bpm: 80, accuracy: 90, cleared: true, valid: true, at: AT },
  });
  assert.equal(deriveCurrentBpm(first.progress), 85);
});

Deno.test("a failed attempt retries the same BPM", () => {
  const failed = evaluateAttempt(createEmptyProgress(), attempt(80, 89.9));
  assert.equal(failed.result.cleared, false);
  assert.equal(failed.progress.highestClearedBpm, null);
  assert.equal(failed.progress.attempts, 1);
  assert.equal(failed.progress.clears, 0);
  assert.equal(failed.progress.bestAccuracy, 89.9);
  assert.equal(deriveCurrentBpm(failed.progress), 80);
});

Deno.test("best accuracy only ever rises and the cleared BPM never drops", () => {
  let progress = createEmptyProgress();
  progress = evaluateAttempt(progress, attempt(80, 97)).progress;
  progress = evaluateAttempt(progress, attempt(85, 60)).progress;
  progress = evaluateAttempt(progress, attempt(85, 92)).progress;
  assert.equal(progress.bestAccuracy, 97);
  assert.equal(progress.highestClearedBpm, 85);
  assert.equal(progress.attempts, 3);
  assert.equal(progress.clears, 2);
  assert.equal(progress.lastAttempt.bpm, 85);
});

Deno.test("a too-slow take is a failed attempt that changes nothing else", () => {
  const slow = evaluateAttempt(
    progressAt(80, { bestAccuracy: 91 }),
    attempt(85, 100, { actualDurationMs: 12001 }),
  );
  assert.deepEqual(slow.result, {
    status: "counted",
    cleared: false,
    valid: false,
  });
  assert.equal(slow.progress.attempts, 2);
  assert.equal(slow.progress.clears, 1);
  assert.equal(slow.progress.highestClearedBpm, 80);
  assert.equal(slow.progress.bestAccuracy, 91);
  assert.equal(slow.progress.lastAttempt.valid, false);
  assert.equal(slow.progress.lastAttempt.cleared, false);
});

Deno.test("attempts without a recording or at the wrong BPM are ignored", () => {
  const start = createEmptyProgress();
  for (
    const [bad, reason] of [
      [attempt(80, null), "no-accuracy"],
      [attempt(80, NaN), "no-accuracy"],
      [attempt(80, 95, { actualDurationMs: 0 }), "no-recording"],
      [attempt(80, 95, { expectedDurationMs: 0 }), "invalid-expected-duration"],
      [attempt(85, 95), "bpm-mismatch"],
      [attempt(75, 95), "bpm-mismatch"],
    ]
  ) {
    const outcome = evaluateAttempt(start, bad);
    assert.deepEqual(outcome.result, { status: "ignored", reason });
    assert.equal(outcome.progress, start);
  }
});

Deno.test("evaluating does not mutate the previous progress", () => {
  const before = progressAt(80);
  const snapshot = structuredClone(before);
  evaluateAttempt(before, attempt(85, 99));
  assert.deepEqual(before, snapshot);
});

Deno.test("the maximum BPM can be cleared and then repeated", () => {
  const done = evaluateAttempt(progressAt(175), attempt(180, 100)).progress;
  assert.equal(done.highestClearedBpm, 180);
  assert.equal(isChallengeComplete(done), true);
  const again = evaluateAttempt(done, attempt(180, 95)).progress;
  assert.equal(again.highestClearedBpm, 180);
  assert.equal(again.clears, done.clears + 1);
});

Deno.test("normalizeProgress repairs inconsistent data", () => {
  assert.deepEqual(normalizeProgress(null), createEmptyProgress());
  assert.deepEqual(normalizeProgress([]), createEmptyProgress());

  const repaired = normalizeProgress({
    currentBpm: 120,
    highestClearedBpm: 87,
    attempts: 0,
    clears: 0,
    bestAccuracy: 150,
    lastAttempt: { bpm: 999, accuracy: 50, at: AT },
    extra: true,
  });
  assert.deepEqual(repaired, {
    highestClearedBpm: 85,
    attempts: 1,
    clears: 1,
    bestAccuracy: null,
    lastAttempt: null,
  });

  assert.equal(
    normalizeProgress({ highestClearedBpm: 79 }).highestClearedBpm,
    null,
  );
  assert.equal(
    normalizeProgress({ highestClearedBpm: 999 }).highestClearedBpm,
    180,
  );
  assert.equal(
    normalizeProgress({ highestClearedBpm: 90.5 }).highestClearedBpm,
    null,
  );
  assert.equal(normalizeProgress({ attempts: -3 }).attempts, 0);
  assert.equal(normalizeProgress({ clears: 5, attempts: 2 }).attempts, 5);
});

Deno.test("a valid lastAttempt survives normalization", () => {
  const last = { bpm: 85, accuracy: 71.4, cleared: false, valid: true, at: AT };
  assert.deepEqual(normalizeProgress({ lastAttempt: last }).lastAttempt, last);
  assert.equal(
    normalizeProgress({ lastAttempt: { ...last, at: "nope" } }).lastAttempt,
    null,
  );
});

Deno.test("unversioned data migrates to version 1 and drops currentBpm", () => {
  const legacy = JSON.stringify({
    charts: {
      [KEY]: {
        currentBpm: 95,
        highestClearedBpm: 90,
        attempts: 4,
        clears: 3,
        bestAccuracy: 96.3,
        bestAccuracyByBpm: { "90": 96.3 },
        lastAttempt: { bpm: 90, accuracy: 96.3, cleared: true, at: AT },
      },
      "not a key": { highestClearedBpm: 100 },
    },
  });
  const { store, status } = parseChallengeStore(legacy);
  assert.equal(status, "ok");
  assert.equal(store.version, 1);
  assert.deepEqual(Object.keys(store.charts), [KEY]);
  assert.deepEqual(store.charts[KEY], {
    highestClearedBpm: 90,
    attempts: 4,
    clears: 3,
    bestAccuracy: 96.3,
    lastAttempt: {
      bpm: 90,
      accuracy: 96.3,
      cleared: true,
      valid: true,
      at: AT,
    },
  });
});

Deno.test("parsing reports empty, corrupt, and future data", () => {
  assert.equal(parseChallengeStore(null).status, "empty");
  assert.equal(parseChallengeStore("").status, "empty");
  assert.equal(parseChallengeStore("{oops").status, "corrupt");
  assert.equal(parseChallengeStore("[]").status, "corrupt");
  assert.equal(parseChallengeStore('{"version":9}').status, "future");
  assert.equal(parseChallengeStore('{"version":-1}').status, "future");
  assert.equal(
    parseChallengeStore('{"version":0}', {}).status,
    "corrupt",
  );
  assert.deepEqual(parseChallengeStore('{"version":1}').store.charts, {});
});

Deno.test("progress persists across repository instances", () => {
  const storage = createFakeStorage();
  const saved = createChallengeRepository(storage).recordAttempt(
    KEY,
    attempt(80, 95),
  );
  assert.equal(saved.ok, true);
  assert.equal(saved.result.cleared, true);

  const loaded = createChallengeRepository(storage).get(KEY);
  assert.equal(loaded.highestClearedBpm, 80);
  assert.equal(deriveCurrentBpm(loaded), 85);

  const raw = JSON.parse(storage.getItem(CHALLENGE_STORAGE_KEY));
  assert.equal(raw.version, 1);
  assert.equal("currentBpm" in raw.charts[KEY], false);
});

Deno.test("charts keep independent progress", () => {
  const repository = createChallengeRepository(createFakeStorage());
  repository.recordAttempt(KEY, attempt(80, 95));
  repository.recordAttempt("saved:abc", attempt(80, 50));
  assert.equal(repository.get(KEY).highestClearedBpm, 80);
  assert.equal(repository.get("saved:abc").highestClearedBpm, null);
  assert.equal(repository.get("saved:abc").attempts, 1);
  assert.deepEqual(repository.get("builtin:other"), createEmptyProgress());
});

Deno.test("ignored attempts are not written", () => {
  const storage = createFakeStorage();
  const repository = createChallengeRepository(storage);
  const outcome = repository.recordAttempt(KEY, attempt(80, null));
  assert.equal(outcome.ok, true);
  assert.equal(outcome.result.status, "ignored");
  assert.equal(storage.getItem(CHALLENGE_STORAGE_KEY), null);
});

Deno.test("each write re-reads storage so other tabs are not clobbered", () => {
  const storage = createFakeStorage();
  const tabA = createChallengeRepository(storage);
  const tabB = createChallengeRepository(storage);
  tabA.recordAttempt("builtin:a", attempt(80, 95));
  tabB.recordAttempt("builtin:b", attempt(80, 95));
  assert.equal(tabA.get("builtin:a").highestClearedBpm, 80);
  assert.equal(tabA.get("builtin:b").highestClearedBpm, 80);
});

Deno.test("remove forgets one chart and clear forgets all", () => {
  const repository = createChallengeRepository(createFakeStorage());
  repository.recordAttempt(KEY, attempt(80, 95));
  repository.recordAttempt("saved:x", attempt(80, 95));
  assert.deepEqual(repository.remove(KEY), { ok: true });
  assert.deepEqual(repository.get(KEY), createEmptyProgress());
  assert.equal(repository.get("saved:x").clears, 1);
  assert.deepEqual(repository.remove("builtin:never"), { ok: true });
  assert.deepEqual(repository.clear(), { ok: true });
  assert.deepEqual(repository.get("saved:x"), createEmptyProgress());
});

Deno.test("an unavailable storage reports it and never throws", () => {
  const repository = createChallengeRepository(null);
  assert.equal(repository.available, false);
  assert.deepEqual(repository.get(KEY), createEmptyProgress());
  assert.deepEqual(repository.recordAttempt(KEY, attempt(80, 95)), {
    ok: false,
    reason: "unavailable",
  });
  assert.deepEqual(repository.clear(), { ok: false, reason: "unavailable" });
});

Deno.test("invalid keys are rejected", () => {
  const repository = createChallengeRepository(createFakeStorage());
  assert.deepEqual(repository.recordAttempt("draft:x", attempt(80, 95)), {
    ok: false,
    reason: "invalid",
  });
  assert.deepEqual(repository.remove(""), { ok: false, reason: "invalid" });
});

Deno.test("corrupt data is replaced and newer data is never overwritten", () => {
  const corrupt = createFakeStorage({ [CHALLENGE_STORAGE_KEY]: "{oops" });
  const repository = createChallengeRepository(corrupt);
  assert.equal(repository.get(KEY).attempts, 0);
  assert.equal(repository.recordAttempt(KEY, attempt(80, 95)).ok, true);
  assert.equal(repository.get(KEY).clears, 1);

  const future = JSON.stringify({ version: 9, charts: {} });
  const storage = createFakeStorage({ [CHALLENGE_STORAGE_KEY]: future });
  const guarded = createChallengeRepository(storage);
  assert.deepEqual(guarded.recordAttempt(KEY, attempt(80, 95)), {
    ok: false,
    reason: "future-version",
  });
  assert.deepEqual(guarded.remove(KEY), {
    ok: false,
    reason: "future-version",
  });
  assert.deepEqual(guarded.clear(), { ok: false, reason: "future-version" });
  assert.equal(storage.getItem(CHALLENGE_STORAGE_KEY), future);
});

Deno.test("a failing write is reported", () => {
  const storage = createFakeStorage();
  storage.setItem = () => {
    throw new Error("quota");
  };
  assert.deepEqual(
    createChallengeRepository(storage).recordAttempt(KEY, attempt(80, 95)),
    { ok: false, reason: "write-failed" },
  );
});

Deno.test("the least recently attempted charts are dropped over the limit", () => {
  const charts = {};
  for (let index = 0; index < MAX_CHALLENGE_CHARTS + 5; index += 1) {
    const at = new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();
    charts[`saved:${index}`] = {
      highestClearedBpm: 80,
      attempts: 1,
      clears: 1,
      bestAccuracy: 90,
      lastAttempt: { bpm: 80, accuracy: 90, cleared: true, valid: true, at },
    };
  }
  const { store } = parseChallengeStore(JSON.stringify({ version: 1, charts }));
  assert.equal(Object.keys(store.charts).length, MAX_CHALLENGE_CHARTS);
  assert.equal("saved:0" in store.charts, false);
  assert.equal(`saved:${MAX_CHALLENGE_CHARTS + 4}` in store.charts, true);
});

Deno.test("the panel view derives the challenge BPM from progress", () => {
  const fresh = describeChallenge({ chartKey: KEY });
  assert.equal(fresh.currentBpm, 80);
  assert.equal(fresh.highestClearedBpm, null);
  assert.equal(fresh.bestAccuracy, null);
  assert.equal(fresh.attempts, 0);
  assert.equal(fresh.canStart, true);
  assert.equal(fresh.canRetry, false);
  assert.equal(fresh.canReset, false);

  const cleared = describeChallenge({
    chartKey: KEY,
    progress: progressAt(90, { bestAccuracy: 96.3, attempts: 4, clears: 3 }),
  });
  assert.equal(cleared.currentBpm, 95);
  assert.equal(cleared.highestClearedBpm, 90);
  assert.equal(cleared.bestAccuracy, 96.3);
  assert.equal(cleared.attempts, 4);
  assert.equal(cleared.clears, 3);
  assert.equal(cleared.canReset, true);
  assert.equal("currentBpm" in progressAt(90), false);
});

Deno.test("retry is offered only after a failed attempt", () => {
  const failed = evaluateAttempt(createEmptyProgress(), attempt(80, 50));
  const afterFail = describeChallenge({
    chartKey: KEY,
    progress: failed.progress,
  });
  assert.equal(afterFail.canRetry, true);
  assert.equal(afterFail.currentBpm, 80);

  const passed = evaluateAttempt(createEmptyProgress(), attempt(80, 95));
  const afterPass = describeChallenge({
    chartKey: KEY,
    progress: passed.progress,
  });
  assert.equal(afterPass.canRetry, false);
  assert.equal(afterPass.canStart, true);
  assert.equal(afterPass.currentBpm, 85);
});

Deno.test("an active challenge disables start, retry and reset", () => {
  const failed = evaluateAttempt(createEmptyProgress(), attempt(80, 50));
  const view = describeChallenge({
    chartKey: KEY,
    progress: failed.progress,
    active: true,
  });
  assert.equal(view.active, true);
  assert.equal(view.canStart, false);
  assert.equal(view.canRetry, false);
  assert.equal(view.canReset, false);
});

Deno.test("a cleared maximum BPM completes the challenge", () => {
  const view = describeChallenge({ chartKey: KEY, progress: progressAt(180) });
  assert.equal(view.complete, true);
  assert.equal(view.canStart, false);
  assert.equal(view.currentBpm, 180);
});

Deno.test("an unsaved chart asks to be saved and cannot start", () => {
  const view = describeChallenge({
    chartKey: createChartKey({ type: "draft", id: "x" }),
  });
  assert.equal(view.eligible, false);
  assert.equal(
    view.unavailableMessage,
    "Save this chart before starting a challenge.",
  );
  assert.equal(SAVE_CHART_MESSAGE, view.unavailableMessage);
  assert.equal(view.currentBpm, null);
  assert.equal(view.canStart, false);
  assert.equal(view.canRetry, false);
  assert.equal(view.canReset, false);
  assert.equal(describeChallenge({ chartKey: KEY }).unavailableMessage, null);
});
