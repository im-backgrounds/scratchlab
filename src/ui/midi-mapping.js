import {
  describeSignature,
  FIXED_VELOCITY_ACTIONS,
  formatMidiActionEvent,
  MIDI_ACTION_LABELS,
  MIDI_ACTIONS,
  STOP_TIMEOUT_MS,
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
    if (
      mapping[action] && !isLearning &&
      !FIXED_VELOCITY_ACTIONS.includes(action)
    ) {
      row.append(createRangeEditor(action, mapping[action], handlers));
    }
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
  list.append(createStopRow());
}

function createStopRow() {
  const row = document.createElement("li");
  row.className = "midi-mapping-row";
  const label = document.createElement("span");
  label.className = "midi-mapping-label";
  label.textContent = MIDI_ACTION_LABELS.stop;
  const value = document.createElement("span");
  value.className = "midi-mapping-value";
  value.textContent =
    `自動判定: Forward/Backwardが${STOP_TIMEOUT_MS}ms入力されないとき`;
  row.append(label, value);
  return row;
}

const FADER_FIELDS = [
  { key: "open", name: "開", hint: "Open" },
  { key: "threshold", name: "閾値", hint: "Threshold" },
  { key: "closed", name: "閉", hint: "Closed" },
];

function createField({ key, name, hint }, value) {
  const label = document.createElement("label");
  label.className = `midi-range-field midi-range-${key}`;
  const caption = document.createElement("span");
  caption.className = "midi-range-caption";
  caption.textContent = name;
  const sub = document.createElement("small");
  sub.textContent = hint;
  caption.append(sub);
  const input = document.createElement("input");
  input.type = "number";
  input.inputMode = "numeric";
  input.min = "0";
  input.max = "127";
  input.step = "1";
  input.value = String(value);
  input.setAttribute("aria-label", `Fader ${name}の値`);
  label.append(caption, input);
  return { key, label, input };
}

function createTrack() {
  const track = document.createElement("div");
  track.className = "midi-range-track";
  track.setAttribute("aria-hidden", "true");
  const openZone = document.createElement("span");
  openZone.className = "midi-range-zone midi-range-zone-open";
  const closedZone = document.createElement("span");
  closedZone.className = "midi-range-zone midi-range-zone-closed";
  const marker = document.createElement("span");
  marker.className = "midi-range-marker";
  const scale = document.createElement("span");
  scale.className = "midi-range-scale";
  scale.append(
    Object.assign(document.createElement("span"), { textContent: "0" }),
    Object.assign(document.createElement("span"), { textContent: "127" }),
  );
  track.append(openZone, closedZone, marker, scale);

  // Mirrors the inputs live so the open/closed layout is visible while typing.
  return {
    element: track,
    update({ open, threshold, closed }) {
      const valid = [open, threshold, closed].every((value) =>
        Number.isInteger(value) && value >= 0 && value <= 127
      );
      track.classList.toggle("is-invalid", !valid);
      if (!valid) return;
      const pct = (value) => `${(value / 127) * 100}%`;
      const place = (zone, from, to) => {
        zone.style.left = pct(Math.min(from, to));
        zone.style.width = `${(Math.abs(to - from) / 127) * 100}%`;
      };
      place(openZone, open, threshold);
      place(closedZone, threshold, closed);
      marker.style.left = pct(threshold);
    },
  };
}

function createRangeEditor(action, entry, handlers) {
  const form = document.createElement("form");
  form.className = "midi-range";
  const fields = FADER_FIELDS.map((field) =>
    createField(field, entry[field.key])
  );
  const track = createTrack();
  const read = () =>
    Object.fromEntries(
      fields.map(({ key, input }) => [key, input.valueAsNumber]),
    );
  track.update(read());
  for (const { input } of fields) {
    input.addEventListener("input", () => track.update(read()));
  }

  const fieldRow = document.createElement("div");
  fieldRow.className = "midi-range-fields";
  fieldRow.append(...fields.map(({ label }) => label));

  const actionsRow = document.createElement("div");
  actionsRow.className = "midi-range-actions";
  const apply = document.createElement("button");
  apply.type = "submit";
  apply.className = "primary-button";
  apply.textContent = "適用";
  const swap = document.createElement("button");
  swap.type = "button";
  swap.className = "secondary-button";
  swap.textContent = "開閉を入れ替え";
  swap.addEventListener("click", () => handlers.onSwapFader(action));
  actionsRow.append(apply, swap);

  form.append(track.element, fieldRow, actionsRow);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    handlers.onRangeChange(action, read());
  });
  return form;
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
