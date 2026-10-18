import assert from "node:assert/strict";
import { createInputEventLog } from "../../src/features/input-event-log.js";

function createLog(limit = 50) {
  const calls = [];
  const log = createInputEventLog({
    limit,
    renderMidiEventLog: (...args) => calls.push(args),
  });
  return { log, calls };
}

function scratch(time) {
  return Object.freeze({ type: "scratch", direction: "forward", time });
}

Deno.test("input event log initialization does not render", () => {
  const { calls } = createLog();
  assert.deepEqual(calls, []);
});

Deno.test("appendRawEvent renders synchronously using the default log target", () => {
  const { log, calls } = createLog();
  const event = scratch(1);
  log.appendRawEvent(event);
  assert.deepEqual(calls, [[[event]]]);
  assert.equal(calls[0][0][0], event);
});

Deno.test("appendPerformanceEvent renders synchronously to the performance target", () => {
  const { log, calls } = createLog();
  const event = scratch(1);
  log.appendPerformanceEvent(event);
  assert.deepEqual(calls, [[[event], "midi-performance-log"]]);
  assert.equal(calls[0][0][0], event);
});

Deno.test("raw and performance logs retain independent event sequences", () => {
  const { log, calls } = createLog();
  const raw = scratch(1);
  const performance = scratch(2);
  const nextRaw = scratch(3);
  log.appendRawEvent(raw);
  log.appendPerformanceEvent(performance);
  log.appendRawEvent(nextRaw);
  assert.deepEqual(calls, [
    [[raw]],
    [[performance], "midi-performance-log"],
    [[raw, nextRaw]],
  ]);
  assert.deepEqual(calls[0][0], [raw]);
});

for (const method of ["appendRawEvent", "appendPerformanceEvent"]) {
  Deno.test(`${method} retains 50 events and removes only the oldest on event 51`, () => {
    const { log, calls } = createLog();
    const events = Array.from({ length: 52 }, (_, index) => scratch(index));
    events.slice(0, 50).forEach((event) => log[method](event));
    assert.equal(calls.length, 50);
    assert.deepEqual(calls.at(-1)[0], events.slice(0, 50));
    log[method](events[50]);
    assert.deepEqual(calls.at(-1)[0], events.slice(1, 51));
    assert.deepEqual(calls[49][0], events.slice(0, 50));
    log[method](events[51]);
    assert.deepEqual(calls.at(-1)[0], events.slice(2));
  });

  Deno.test(`${method} applies a custom limit`, () => {
    const { log, calls } = createLog(2);
    const events = [scratch(1), scratch(2), scratch(3)];
    events.forEach((event) => log[method](event));
    assert.deepEqual(calls.at(-1)[0], events.slice(1));
  });
}

Deno.test("input event log instances do not share raw or performance state", () => {
  const first = createLog();
  const second = createLog();
  const event = scratch(1);
  first.log.appendRawEvent(event);
  first.log.appendPerformanceEvent(event);
  assert.deepEqual(second.calls, []);
  const other = scratch(2);
  second.log.appendRawEvent(other);
  second.log.appendPerformanceEvent(other);
  assert.deepEqual(second.calls, [
    [[other]],
    [[other], "midi-performance-log"],
  ]);
});

Deno.test("logs preserve event contents, references, order and duplicate events", () => {
  const { log, calls } = createLog();
  const events = Object.freeze([
    scratch(20),
    Object.freeze({ type: "fader", state: "closed", time: 10 }),
    scratch(20),
  ]);
  for (const event of events) {
    log.appendRawEvent(event);
    log.appendPerformanceEvent(event);
  }
  for (const call of calls.slice(-2)) {
    assert.deepEqual(call[0], events);
    call[0].forEach((event, index) => assert.equal(event, events[index]));
  }
});
