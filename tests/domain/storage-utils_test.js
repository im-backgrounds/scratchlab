import assert from "node:assert/strict";
import {
  safeGetItem,
  safeRemoveItem,
  safeSetItem,
} from "../../src/domain/storage-utils.js";

Deno.test("safeGetItem returns the stored value or null without changing storage", () => {
  const data = new Map([["key", "stored"]]);
  const storage = { getItem: (key) => data.get(key) ?? null };
  assert.deepEqual(safeGetItem(storage, "key"), { ok: true, value: "stored" });
  assert.deepEqual(safeGetItem(storage, "missing"), { ok: true, value: null });
  assert.deepEqual([...data], [["key", "stored"]]);
});

Deno.test("safeSetItem writes the supplied key and string value", () => {
  const calls = [];
  const storage = {
    setItem: (key, value) => calls.push([key, value]),
  };
  assert.deepEqual(safeSetItem(storage, "custom-key", "{raw}"), { ok: true });
  assert.deepEqual(calls, [["custom-key", "{raw}"]]);
});

Deno.test("safeRemoveItem removes only the supplied key", () => {
  const data = new Map([["remove", "a"], ["keep", "b"]]);
  const storage = { removeItem: (key) => data.delete(key) };
  assert.deepEqual(safeRemoveItem(storage, "remove"), { ok: true });
  assert.deepEqual([...data], [["keep", "b"]]);
});

for (
  const [method, call] of [
    ["getItem", (storage) => safeGetItem(storage, "key")],
    ["setItem", (storage) => safeSetItem(storage, "key", "value")],
    ["removeItem", (storage) => safeRemoveItem(storage, "key")],
  ]
) {
  Deno.test(`${method} exceptions return the original error object`, () => {
    const error = new DOMException("blocked", "SecurityError");
    const storage = {
      [method]() {
        throw error;
      },
    };
    const result = call(storage);
    assert.equal(result.ok, false);
    assert.equal(result.error, error);
    assert.deepEqual(Object.keys(result).sort(), ["error", "ok"]);
  });
}
