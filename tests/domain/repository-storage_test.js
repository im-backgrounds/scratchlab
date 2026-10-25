import assert from "node:assert/strict";
import {
  createChartRepository,
  getBrowserStorage,
  STORAGE_KEY,
} from "../../src/domain/chart-storage.js";
import {
  createChallengeRepository,
  createEmptyProgress,
} from "../../src/domain/bpm-challenge.js";
import {
  createPerformance,
  createPerformanceRepository,
} from "../../src/domain/performance.js";
import {
  ACHIEVEMENT_STORAGE_KEY,
  ACHIEVEMENT_VERSION,
  createAchievementRepository,
} from "../../src/domain/achievement-system.js";
import {
  BEGINNER_COURSE_STORAGE_KEY,
  BEGINNER_COURSE_VERSION,
  createBeginnerCourseRepository,
} from "../../src/domain/beginner-course.js";
import {
  createEmptyMapping,
  createMidiMappingRepository,
} from "../../src/domain/midi-mapping.js";

function createStorage() {
  const data = new Map();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
}

const practiceSession = {
  id: "session-1",
  pattern: "baby-scratch",
  bpm: 80,
  accuracy: 95,
  cleared: true,
  at: "2026-10-19T00:00:00.000Z",
};
const performance = createPerformance(
  [{ type: "scratch", direction: "forward", time: 1100 }],
  { startedAt: 1000, endedAt: 2000 },
);

for (
  const { name, create, read, expected, save } of [
    {
      name: "BPM Challenge",
      create: createChallengeRepository,
      read: (repository) => repository.get("builtin:baby-scratch"),
      expected: createEmptyProgress(),
      save: (repository) =>
        repository.recordAttempt("builtin:baby-scratch", {
          bpm: 80,
          accuracy: 95,
          actualDurationMs: 1000,
          expectedDurationMs: 1000,
          at: practiceSession.at,
        }),
    },
    {
      name: "Performance",
      create: createPerformanceRepository,
      read: (repository) => repository.load(),
      expected: null,
      save: (repository) => repository.save(performance),
    },
    {
      name: "Achievement",
      create: createAchievementRepository,
      read: (repository) => repository.load().status,
      expected: "unavailable",
      save: (repository) => repository.recordSession(practiceSession),
    },
    {
      name: "MIDI mapping",
      create: createMidiMappingRepository,
      read: (repository) => repository.load(),
      expected: createEmptyMapping(),
      save: (repository) => repository.save(createEmptyMapping()),
    },
  ]
) {
  Deno.test(`${name} read exceptions prevent writes and preserve its load result`, () => {
    const storage = createStorage();
    storage.getItem = () => {
      throw new Error("read blocked");
    };
    let writes = 0;
    storage.setItem = () => writes += 1;
    const repository = create(storage);
    assert.deepEqual(read(repository), expected);
    assert.deepEqual(save(repository), { ok: false, reason: "unavailable" });
    assert.equal(writes, 0);
  });
}

Deno.test("chart read exceptions remain corrupt without a backup and permit replacement", () => {
  const storage = createStorage();
  storage.getItem = () => {
    throw new Error("read blocked");
  };
  const repository = createChartRepository(storage);
  assert.deepEqual(repository.load(), {
    charts: [],
    session: null,
    status: "corrupt",
  });
  assert.deepEqual(repository.saveSession({ view: "builder" }), { ok: true });
  assert.equal(storage.data.has(`${STORAGE_KEY}.backup`), false);
  assert.equal(
    JSON.parse(storage.data.get(STORAGE_KEY)).session.view,
    "builder",
  );
});

Deno.test("Beginner Course read-failed blocks later writes even after reads recover", () => {
  const storage = createStorage();
  const getItem = storage.getItem;
  storage.getItem = () => {
    throw new Error("read blocked");
  };
  const repository = createBeginnerCourseRepository(storage);
  const before = repository.progress;
  assert.deepEqual(repository.load(), { ok: false, reason: "read-failed" });
  storage.getItem = getItem;
  assert.equal(repository.load().ok, true);
  let writes = 0;
  storage.setItem = () => writes += 1;
  assert.deepEqual(repository.complete("baby-scratch"), {
    ok: false,
    reason: "read-failed",
  });
  assert.equal(writes, 0);
  assert.equal(repository.progress, before);
});

for (
  const [name, create] of [
    ["BPM Challenge", createChallengeRepository],
    ["Performance", createPerformanceRepository],
    ["Achievement", createAchievementRepository],
  ]
) {
  Deno.test(`${name} delete exceptions report write-failed without altering stored data`, () => {
    const storage = createStorage();
    const repository = create(storage);
    if (name === "Performance") {
      assert.equal(repository.save(performance).ok, true);
    } else if (name === "Achievement") {
      assert.equal(repository.recordSession(practiceSession).ok, true);
    } else {
      assert.equal(
        repository.recordAttempt("builtin:baby-scratch", {
          bpm: 80,
          accuracy: 95,
          actualDurationMs: 1000,
          expectedDurationMs: 1000,
        }).ok,
        true,
      );
    }
    const before = [...storage.data];
    storage.removeItem = () => {
      throw new Error("delete blocked");
    };
    assert.deepEqual(repository.clear(), { ok: false, reason: "write-failed" });
    assert.deepEqual([...storage.data], before);
  });
}

Deno.test("Achievement write exceptions report failure without retaining a session", () => {
  const storage = createStorage();
  storage.setItem = () => {
    throw new Error("quota");
  };
  const repository = createAchievementRepository(storage);
  assert.deepEqual(repository.recordSession(practiceSession), {
    ok: false,
    reason: "write-failed",
  });
  assert.deepEqual(repository.load().sessions, []);
});

Deno.test("Achievement future-version data cannot be overwritten or cleared", () => {
  const storage = createStorage();
  const future = JSON.stringify({ version: ACHIEVEMENT_VERSION + 1 });
  storage.setItem(ACHIEVEMENT_STORAGE_KEY, future);
  const repository = createAchievementRepository(storage);
  assert.equal(repository.load().status, "future");
  assert.deepEqual(repository.recordSession(practiceSession), {
    ok: false,
    reason: "future-version",
  });
  assert.deepEqual(repository.clear(), { ok: false, reason: "future-version" });
  assert.equal(storage.getItem(ACHIEVEMENT_STORAGE_KEY), future);
});

Deno.test("Beginner Course failed writes preserve memory and allow a successful retry", () => {
  const storage = createStorage();
  const setItem = storage.setItem;
  const repository = createBeginnerCourseRepository(storage);
  repository.load();
  const before = repository.progress;
  storage.setItem = () => {
    throw new Error("quota");
  };
  assert.deepEqual(repository.complete("baby-scratch"), {
    ok: false,
    reason: "write-failed",
  });
  assert.equal(repository.progress, before);
  assert.equal(storage.data.size, 0);
  storage.setItem = setItem;
  assert.equal(repository.complete("baby-scratch").ok, true);
  assert.deepEqual(repository.progress.completedStageIds, ["baby-scratch"]);
});

Deno.test("Beginner Course stale repositories preserve sequentially completed stages", () => {
  const storage = createStorage();
  const first = createBeginnerCourseRepository(storage);
  const stale = createBeginnerCourseRepository(storage);
  first.load();
  stale.load();

  assert.equal(first.complete("baby-scratch").ok, true);
  assert.equal(first.complete("forward-scratch").ok, true);
  assert.equal(stale.complete("baby-scratch").ok, true);

  const saved = JSON.parse(storage.getItem(BEGINNER_COURSE_STORAGE_KEY));
  assert.deepEqual(saved.completedStageIds, [
    "baby-scratch",
    "forward-scratch",
  ]);
  assert.deepEqual(stale.progress.completedStageIds, saved.completedStageIds);
});

Deno.test("Beginner Course replaying an earlier stage never regresses progress", () => {
  const storage = createStorage();
  const repository = createBeginnerCourseRepository(storage);
  repository.load();
  repository.complete("baby-scratch");
  repository.complete("forward-scratch");

  assert.equal(repository.complete("baby-scratch").ok, true);
  assert.deepEqual(repository.progress.completedStageIds, [
    "baby-scratch",
    "forward-scratch",
  ]);
});

Deno.test("Beginner Course completion rechecks and protects future-version data", () => {
  const storage = createStorage();
  const repository = createBeginnerCourseRepository(storage);
  repository.load();
  repository.complete("baby-scratch");
  const before = repository.progress;
  const future = JSON.stringify({
    version: BEGINNER_COURSE_VERSION + 1,
    courseId: "beginner",
    completedStageIds: ["baby-scratch"],
  });
  storage.setItem(BEGINNER_COURSE_STORAGE_KEY, future);
  let writes = 0;
  storage.setItem = () => writes += 1;

  assert.deepEqual(repository.complete("forward-scratch"), {
    ok: false,
    reason: "future-version",
  });
  assert.equal(repository.progress, before);
  assert.equal(storage.data.get(BEGINNER_COURSE_STORAGE_KEY), future);
  assert.equal(writes, 0);
});

Deno.test("Beginner Course completion read failures preserve memory and stored data", () => {
  const storage = createStorage();
  const repository = createBeginnerCourseRepository(storage);
  repository.load();
  repository.complete("baby-scratch");
  const before = repository.progress;
  const saved = storage.getItem(BEGINNER_COURSE_STORAGE_KEY);
  storage.getItem = () => {
    throw new Error("read blocked");
  };
  let writes = 0;
  storage.setItem = () => writes += 1;

  assert.deepEqual(repository.complete("forward-scratch"), {
    ok: false,
    reason: "read-failed",
  });
  assert.equal(repository.progress, before);
  assert.equal(saved, storage.data.get(BEGINNER_COURSE_STORAGE_KEY));
  assert.equal(writes, 0);
});

Deno.test("Beginner Course future-version progress blocks completion", () => {
  const storage = createStorage();
  const future = JSON.stringify({
    version: BEGINNER_COURSE_VERSION + 1,
    courseId: "beginner",
    completedStageIds: [],
  });
  storage.setItem(BEGINNER_COURSE_STORAGE_KEY, future);
  const repository = createBeginnerCourseRepository(storage);
  assert.deepEqual(repository.load(), {
    ok: false,
    reason: "future-version",
  });
  assert.deepEqual(repository.complete("baby-scratch"), {
    ok: false,
    reason: "future-version",
  });
  assert.equal(storage.getItem(BEGINNER_COURSE_STORAGE_KEY), future);
});

Deno.test("chart backup failure preserves original data and never writes the main key", () => {
  const storage = createStorage();
  const key = "custom.chart-store";
  const raw = "{broken";
  storage.setItem(key, raw);
  const writes = [];
  storage.setItem = (writeKey, value) => {
    writes.push([writeKey, value]);
    throw new Error("backup blocked");
  };
  const repository = createChartRepository(storage, { key });
  assert.deepEqual(repository.saveSession({ view: "builder" }), {
    ok: false,
    reason: "write-failed",
  });
  assert.deepEqual(writes, [[`${key}.backup`, raw]]);
  assert.deepEqual([...storage.data], [[key, raw]]);
});

Deno.test("chart main write failure keeps the completed backup and original data", () => {
  const storage = createStorage();
  const raw = "{broken";
  storage.setItem(STORAGE_KEY, raw);
  const setItem = storage.setItem;
  const writes = [];
  storage.setItem = (key, value) => {
    writes.push(key);
    if (key === STORAGE_KEY) throw new Error("main write blocked");
    setItem(key, value);
  };
  assert.deepEqual(
    createChartRepository(storage).saveSession({ view: "builder" }),
    { ok: false, reason: "write-failed" },
  );
  assert.deepEqual(writes, [`${STORAGE_KEY}.backup`, STORAGE_KEY]);
  assert.equal(storage.getItem(`${STORAGE_KEY}.backup`), raw);
  assert.equal(storage.getItem(STORAGE_KEY), raw);
});

Deno.test("browser storage probe deletion failure returns null", () => {
  const storage = createStorage();
  storage.removeItem = () => {
    throw new Error("delete blocked");
  };
  assert.equal(getBrowserStorage({ localStorage: storage }), null);
  assert.deepEqual([...storage.data], [[`${STORAGE_KEY}.probe`, "1"]]);
});
