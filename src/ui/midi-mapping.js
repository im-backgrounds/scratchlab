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

export function renderMidiEventCounts(rawCount, performanceCount) {
  document.getElementById("midi-event-counts").textContent =
    `受信 ${rawCount}件 → パフォーマンス ${performanceCount}件`;
}

export function renderMidiMappingStatus(message) {
  document.getElementById("midi-mapping-status").textContent = message;
}

export function renderMidiInputs({ inputs, selectedInputId, connected }) {
  const list = document.getElementById("midi-device-list");
  list.replaceChildren();
  for (const input of inputs) {
    const row = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = input.manufacturer
      ? `${input.name} (${input.manufacturer})`
      : input.name;
    const status = document.createElement("span");
    status.textContent = input.state === "connected"
      ? "Connected"
      : "Disconnected";
    row.append(name, status);
    list.append(row);
  }
  if (!inputs.length) {
    const empty = document.createElement("li");
    empty.textContent = "利用可能なMIDI入力デバイスはありません。";
    list.append(empty);
  }

  const select = document.getElementById("midi-input-select");
  select.replaceChildren();
  const allInputs = document.createElement("option");
  allInputs.value = "all";
  allInputs.textContent = "すべての入力デバイス";
  select.append(allInputs);
  for (const input of inputs) {
    const option = document.createElement("option");
    option.value = input.id;
    option.textContent = input.name;
    option.disabled = input.state !== "connected";
    select.append(option);
  }
  if (
    selectedInputId !== "all" &&
    !inputs.some((input) => input.id === selectedInputId)
  ) {
    const missing = document.createElement("option");
    missing.value = selectedInputId;
    missing.textContent = "保存済みのデバイスは未接続";
    missing.disabled = true;
    select.append(missing);
  }
  select.value = selectedInputId;
  select.disabled = !inputs.some((input) => input.state === "connected");
  document.getElementById("midi-connection-status").textContent = connected
    ? "Connected"
    : "Disconnected";
}

export function renderMidiInputMonitor({
  crossfader,
  forward,
  backward,
  stop,
}) {
  document.getElementById("midi-monitor-crossfader").textContent =
    crossfader ?? "未入力";
  document.getElementById("midi-monitor-forward").textContent =
    forward ?? "未入力";
  document.getElementById("midi-monitor-backward").textContent =
    backward ?? "未入力";
  document.getElementById("midi-monitor-stop").textContent =
    stop ?? "未入力";
}

export function renderMidiDiagnosticLog(entries) {
  document.getElementById("midi-diagnostic-log").textContent = entries.length
    ? entries.join("\n")
    : "MIDIメッセージはまだありません。";
}

const EMPTY_LOG_MESSAGES = {
  "midi-event-log": "変換されたイベントはまだありません。",
  "midi-performance-log": "パフォーマンスイベントはまだありません。",
};

/**
 * Renders one of the event logs: the raw converted events
 * ("midi-event-log") or the compressed performance events
 * ("midi-performance-log").
 */
export function renderMidiEventLog(events, id = "midi-event-log") {
  const log = document.getElementById(id);
  if (!events.length) {
    log.textContent = EMPTY_LOG_MESSAGES[id];
    return;
  }
  const start = events[0].time;
  log.textContent = events
    .map((event) => formatMidiActionEvent(event, start))
    .join("\n");
  log.scrollTop = log.scrollHeight;
}
