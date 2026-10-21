export const MIDI_DIAGNOSTIC_LOG_LIMIT = 20;

export function createMidiDiagnosticLog({
  limit = MIDI_DIAGNOSTIC_LOG_LIMIT,
  onChange = () => {},
  now = () => Date.now(),
}) {
  let entries = [];

  return {
    append(data, time = now()) {
      entries = [...entries, formatMidiDiagnostic(data, time)].slice(-limit);
      onChange(entries);
    },
    getEntries() {
      return [...entries];
    },
  };
}

export function formatMidiDiagnostic(data, timestamp) {
  const [status, number, value] = data;
  const type = status & 0xf0;
  const messageType = type === 0xb0
    ? `CC${number}`
    : type === 0x90
    ? `Note${number}`
    : `0x${status.toString(16).toUpperCase()}`;
  const date = new Date(timestamp);
  const time = [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
  return `${time} ${messageType} ${value}`;
}
