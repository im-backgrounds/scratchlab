import {
  describeSignature,
  formatMidiActionEvent,
  MIDI_ACTION_LABELS,
  MIDI_ACTIONS,
} from "../domain/midi-mapping.js";

export function renderMidiMapping(mapping, learnAction, handlers) {
  const list = document.getElementById("midi-mapping-list");
  list.replaceChildren();
  for (const action of MIDI_ACTIONS) {
    const row = document.createElement("li");
    row.className = "midi-mapping-row";
    const label = document.createElement("span");
    label.className = "midi-mapping-label";
    label.textContent = MIDI_ACTION_LABELS[action];
    const value = document.createElement("span");
    value.className = "midi-mapping-value";
    const isLearning = learnAction === action;
    value.textContent = isLearning
      ? "MIDI入力を待っています…"
      : describeSignature(mapping[action]);

    const learn = document.createElement("button");
    learn.type = "button";
    learn.className = "secondary-button";
    learn.textContent = isLearning ? "キャンセル" : "Learn";
    learn.setAttribute("aria-pressed", String(isLearning));
    learn.addEventListener("click", () => handlers.onLearn(action));

    row.append(label, value, learn);
    if (mapping[action] && !isLearning) {
      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "secondary-button";
      clear.textContent = "解除";
      clear.addEventListener("click", () => handlers.onClear(action));
      row.append(clear);
    }
    list.append(row);
  }
}

export function renderMidiMappingStatus(message) {
  document.getElementById("midi-mapping-status").textContent = message;
}

export function renderMidiEventLog(events) {
  const log = document.getElementById("midi-event-log");
  if (!events.length) {
    log.textContent = "変換されたイベントはまだありません。";
    return;
  }
  const start = events[0].time;
  log.textContent = events
    .map((event) => formatMidiActionEvent(event, start))
    .join("\n");
  log.scrollTop = log.scrollHeight;
}
