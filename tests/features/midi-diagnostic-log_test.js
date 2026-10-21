import assert from "node:assert/strict";
import {
  createMidiDiagnosticLog,
  formatMidiDiagnostic,
  MIDI_DIAGNOSTIC_LOG_LIMIT,
} from "../../src/features/midi-diagnostic-log.js";

Deno.test("diagnostics format CC and note messages with local time", () => {
  assert.match(
    formatMidiDiagnostic([0xb0, 21, 127], new Date(2024, 0, 2, 12, 34, 56)),
    /^12:34:56 CC21 127$/,
  );
  assert.match(
    formatMidiDiagnostic([0x90, 36, 100], new Date(2024, 0, 2, 1, 2, 3)),
    /^01:02:03 Note36 100$/,
  );
});

Deno.test("diagnostic history retains only the latest 20 entries", () => {
  const rendered = [];
  const log = createMidiDiagnosticLog({ onChange: (entries) => rendered.push(entries) });
  for (let value = 0; value < MIDI_DIAGNOSTIC_LOG_LIMIT + 2; value += 1) {
    log.append([0xb0, 21, value], 0);
  }
  assert.equal(log.getEntries().length, MIDI_DIAGNOSTIC_LOG_LIMIT);
  assert.equal(log.getEntries()[0], "00:00:00 CC21 2");
  assert.equal(log.getEntries().at(-1), "00:00:00 CC21 21");
  assert.equal(rendered.length, MIDI_DIAGNOSTIC_LOG_LIMIT + 2);
});
