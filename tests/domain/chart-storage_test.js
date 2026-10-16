import assert from "node:assert/strict";
import {
  createChartRepository,
  createEmptyStore,
  getBrowserStorage,
  MAX_NAME_LENGTH,
  MAX_SAVED_CHARTS,
  parseStore,
  STORAGE_KEY,
  STORAGE_VERSION,
} from "../../src/domain/chart-storage.js";
import { compileScoreData } from "../../src/domain/score-compiler.js";

const chartA = {
  name: "Baby",
  difficulty: "Easy",
  beat: "4/4",
  score: [["F", "B", "F", "B"]],
};
const chartB = {
  name: "Flare",
  difficulty: "Hard",
  beat: "4/4",
  score: [["FF", "K", "BC3", "BM"], ["FO", "B", "F", "B"]],
};

function createMemoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => void data.set(key, String(value)),
    removeItem: (key) => void data.delete(key),
  };
}

function createRepository(storage = createMemoryStorage()) {
  let tick = 1000;
  let nextId = 0;
  const repository = createChartRepository(storage, {
    now: () => ++tick,
    createId: () => `id-${++nextId}`,
  });
  return { repository, storage };
}

Deno.test("parseStore treats missing storage as an empty store", () => {
  for (const text of [null, undefined, ""]) {
    assert.deepEqual(parseStore(text), {
      store: createEmptyStore(),
      status: "empty",
    });
  }
});

Deno.test("parseStore reports corrupt data without throwing", () => {
  for (const text of ["{oops", "42", "null", "[]", '"text"']) {
    const result = parseStore(text);
    assert.equal(result.status, "corrupt");
    assert.deepEqual(result.store, createEmptyStore());
  }
});

Deno.test("parseStore rejects data from a newer version", () => {
  const text = JSON.stringify({ version: STORAGE_VERSION + 1, charts: [] });
  assert.equal(parseStore(text).status, "future");
});

Deno.test("parseStore migrates unversioned data to the current version", () => {
  const legacy = JSON.stringify({
    charts: [{ id: "old", chart: chartA, createdAt: 5, updatedAt: 9 }],
    session: { view: "builder", selectedChartId: "baby-scratch" },
  });
  const { store, status } = parseStore(legacy);
  assert.equal(status, "ok");
  assert.equal(store.version, STORAGE_VERSION);
  assert.equal(store.charts[0].id, "old");
  assert.deepEqual(store.charts[0].chart, chartA);
  assert.equal(store.session.view, "builder");
  assert.equal(store.session.draft, null);
});

Deno.test("parseStore reports corrupt when a migration step is missing", () => {
  assert.equal(
    parseStore(JSON.stringify({ charts: [] }), {}).status,
    "corrupt",
  );
});

Deno.test("parseStore drops malformed and duplicate entries", () => {
  const text = JSON.stringify({
    version: 1,
    charts: [
      { id: "ok", chart: chartA, createdAt: 1, updatedAt: 2 },
      { id: "ok", chart: chartB, createdAt: 1, updatedAt: 2 },
      { id: "", chart: chartA },
      { id: "no-score", chart: { name: "x" } },
      "garbage",
      null,
    ],
    session: { view: "unknown", selectedChartId: 7, draft: { chart: "bad" } },
  });
  const { store } = parseStore(text);
  assert.deepEqual(store.charts.map((entry) => entry.id), ["ok"]);
  assert.deepEqual(store.session, {
    view: "practice",
    selectedChartId: null,
    draft: null,
  });
});

Deno.test("repository saves, lists and gets charts", () => {
  const { repository } = createRepository();
  const first = repository.save({ chart: chartA });
  const second = repository.save({ chart: chartB });
  assert.equal(first.ok && second.ok, true);
  assert.deepEqual(
    repository.list().map((entry) => entry.chart.name),
    ["Flare", "Baby"],
  );
  assert.deepEqual(repository.get("id-1").chart, chartA);
  assert.equal(repository.get("missing"), null);
});

Deno.test("saved charts keep the shareable JSON structure", () => {
  const { repository } = createRepository();
  const { entry } = repository.save({
    chart: { ...chartB, description: "extra metadata" },
  });
  assert.deepEqual(entry.chart, { ...chartB, description: "extra metadata" });
  compileScoreData(repository.get(entry.id).chart);
});

Deno.test("save stores a detached copy of the chart", () => {
  const { repository } = createRepository();
  const chart = structuredClone(chartA);
  repository.save({ chart });
  chart.score[0][0] = "B";
  assert.equal(repository.get("id-1").chart.score[0][0], "F");
});

Deno.test("save updates an existing chart and refreshes updatedAt", () => {
  const { repository } = createRepository();
  const created = repository.save({ chart: chartA }).entry;
  const updated = repository.save({ id: created.id, chart: chartB });
  assert.equal(updated.ok, true);
  assert.equal(repository.list().length, 1);
  assert.equal(repository.get(created.id).chart.name, "Flare");
  assert.equal(updated.entry.createdAt, created.createdAt);
  assert.ok(updated.entry.updatedAt > created.updatedAt);
});

Deno.test("save reports not-found for an unknown id", () => {
  const { repository } = createRepository();
  assert.deepEqual(repository.save({ id: "nope", chart: chartA }), {
    ok: false,
    reason: "not-found",
  });
});

Deno.test("save rejects charts that fail score compilation", () => {
  const { repository, storage } = createRepository();
  const result = repository.save({
    chart: { ...chartA, score: [["FK"]] },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalid-chart");
  assert.equal(storage.data.size, 0);
  assert.equal(repository.save({ chart: null }).ok, false);
});

Deno.test("save falls back to a default name and limits name length", () => {
  const { repository } = createRepository();
  const unnamed = repository.save({ chart: { ...chartA, name: "   " } });
  assert.equal(unnamed.entry.chart.name, "無題の譜面");
  const long = repository.save({
    chart: { ...chartA, name: "あ".repeat(MAX_NAME_LENGTH + 20) },
  });
  assert.equal(long.entry.chart.name.length, MAX_NAME_LENGTH);
});

Deno.test("rename changes the chart name only", () => {
  const { repository } = createRepository();
  const { entry } = repository.save({ chart: chartB });
  const result = repository.rename(entry.id, "  New name  ");
  assert.equal(result.ok, true);
  const stored = repository.get(entry.id).chart;
  assert.equal(stored.name, "New name");
  assert.deepEqual({ ...stored, name: chartB.name }, chartB);
});

Deno.test("rename validates the name and id", () => {
  const { repository } = createRepository();
  const { entry } = repository.save({ chart: chartA });
  assert.equal(repository.rename(entry.id, "   ").reason, "invalid-name");
  assert.equal(repository.rename(entry.id, 5).reason, "invalid-name");
  assert.equal(repository.rename("nope", "x").reason, "not-found");
  assert.equal(repository.get(entry.id).chart.name, "Baby");
});

Deno.test("remove deletes a chart and unlinks it from the session draft", () => {
  const { repository } = createRepository();
  const { entry } = repository.save({ chart: chartA });
  repository.saveSession({
    view: "builder",
    selectedChartId: "baby-scratch",
    draft: { chart: chartA, savedChartId: entry.id },
  });
  assert.equal(repository.remove(entry.id).ok, true);
  assert.equal(repository.list().length, 0);
  assert.equal(repository.getSession().draft.savedChartId, null);
  assert.equal(repository.remove(entry.id).reason, "not-found");
});

Deno.test("session round-trips view, selection and draft", () => {
  const { repository } = createRepository();
  assert.equal(repository.getSession(), null);
  const session = {
    view: "builder",
    selectedChartId: "flare-orbit",
    draft: { chart: chartB, savedChartId: null },
  };
  assert.equal(repository.saveSession(session).ok, true);
  assert.deepEqual(repository.getSession(), session);
  repository.clearSession();
  assert.equal(repository.getSession(), null);
});

Deno.test("saved charts and session persist across repository instances", () => {
  const storage = createMemoryStorage();
  const first = createRepository(storage).repository;
  first.save({ chart: chartA });
  first.saveSession({ view: "guide", selectedChartId: null, draft: null });
  const second = createChartRepository(storage);
  assert.equal(second.list().length, 1);
  assert.equal(second.getSession().view, "guide");
});

Deno.test("mutations re-read storage so other tabs' changes survive", () => {
  const storage = createMemoryStorage();
  const tabOne = createRepository(storage).repository;
  const tabTwo = createChartRepository(storage, {
    createId: () => "tab-two",
  });
  tabOne.save({ chart: chartA });
  tabTwo.save({ chart: chartB });
  assert.deepEqual(
    tabOne.list().map((entry) => entry.chart.name).sort(),
    ["Baby", "Flare"],
  );
});

Deno.test("save enforces the saved chart limit", () => {
  const { repository } = createRepository();
  for (let index = 0; index < MAX_SAVED_CHARTS; index += 1) {
    assert.equal(repository.save({ chart: chartA }).ok, true);
  }
  assert.equal(repository.save({ chart: chartA }).reason, "limit-reached");
  const existing = repository.list()[0];
  assert.equal(repository.save({ id: existing.id, chart: chartB }).ok, true);
});

Deno.test("write failures such as quota errors are reported, not thrown", () => {
  const storage = createMemoryStorage();
  storage.setItem = () => {
    throw new DOMException("full", "QuotaExceededError");
  };
  const { repository } = createRepository(storage);
  assert.equal(repository.save({ chart: chartA }).reason, "write-failed");
  assert.equal(repository.list().length, 0);
});

Deno.test("repository without storage is inert but safe", () => {
  const repository = createChartRepository(null);
  assert.equal(repository.available, false);
  assert.deepEqual(repository.list(), []);
  assert.equal(repository.getSession(), null);
  assert.equal(repository.save({ chart: chartA }).reason, "unavailable");
  assert.equal(repository.saveSession({}).reason, "unavailable");
});

Deno.test("newer-version data is never overwritten", () => {
  const future = JSON.stringify({ version: STORAGE_VERSION + 1, charts: [] });
  const { repository, storage } = createRepository(
    createMemoryStorage({ [STORAGE_KEY]: future }),
  );
  assert.equal(repository.save({ chart: chartA }).reason, "future-version");
  assert.equal(repository.saveSession({}).reason, "future-version");
  assert.equal(storage.getItem(STORAGE_KEY), future);
  assert.equal(repository.load().status, "future");
});

Deno.test("corrupt data is backed up before being replaced", () => {
  const { repository, storage } = createRepository(
    createMemoryStorage({ [STORAGE_KEY]: "{broken" }),
  );
  assert.equal(repository.load().status, "corrupt");
  assert.equal(repository.save({ chart: chartA }).ok, true);
  assert.equal(storage.getItem(`${STORAGE_KEY}.backup`), "{broken");
  assert.equal(repository.list().length, 1);
});

Deno.test("stored data is versioned JSON", () => {
  const { repository, storage } = createRepository();
  repository.save({ chart: chartA });
  const stored = JSON.parse(storage.getItem(STORAGE_KEY));
  assert.equal(stored.version, STORAGE_VERSION);
  assert.equal(stored.charts.length, 1);
});

Deno.test("getBrowserStorage returns null when storage is blocked", () => {
  const blocked = {
    get localStorage() {
      throw new DOMException("denied", "SecurityError");
    },
  };
  assert.equal(getBrowserStorage(blocked), null);
  assert.equal(getBrowserStorage({}), null);
  const readOnly = {
    localStorage: {
      setItem() {
        throw new DOMException("full", "QuotaExceededError");
      },
    },
  };
  assert.equal(getBrowserStorage(readOnly), null);
  const working = createMemoryStorage();
  assert.equal(getBrowserStorage({ localStorage: working }), working);
  assert.equal(working.data.size, 0);
});
