export function createInputEventLog({ limit, renderMidiEventLog }) {
  let rawEventLog = [];
  let performanceEventLog = [];

  return {
    appendRawEvent(event) {
      rawEventLog = [...rawEventLog, event].slice(-limit);
      renderMidiEventLog(rawEventLog);
    },
    appendPerformanceEvent(event) {
      performanceEventLog = [...performanceEventLog, event].slice(-limit);
      renderMidiEventLog(performanceEventLog, "midi-performance-log");
    },
  };
}
