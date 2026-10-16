const dateFormat = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatTimestamp(timestamp) {
  return timestamp ? dateFormat.format(new Date(timestamp)) : "";
}

function createButton(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function createRenameForm(entry, { onRename, onCancelRename }) {
  const form = document.createElement("form");
  form.className = "saved-chart-actions";
  const input = document.createElement("input");
  input.className = "saved-chart-rename";
  input.type = "text";
  input.maxLength = 80;
  input.value = entry.chart.name;
  input.setAttribute("aria-label", "新しい譜面名");
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "primary-button";
  submit.textContent = "保存";
  form.append(
    input,
    submit,
    createButton("キャンセル", "secondary-button", onCancelRename),
  );
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    onRename(entry.id, input.value);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") onCancelRename();
  });
  queueMicrotask(() => {
    input.focus();
    input.select();
  });
  return form;
}

function createEntryItem(entry, { activeId, renamingId }, handlers) {
  const item = document.createElement("li");
  item.className = `saved-chart-item${entry.id === activeId ? " active" : ""}`;

  const info = document.createElement("div");
  info.className = "saved-chart-info";
  const name = document.createElement("strong");
  name.className = "saved-chart-name";
  name.textContent = entry.chart.name;
  const barCount = Array.isArray(entry.chart.score)
    ? entry.chart.score.length
    : 0;
  const meta = document.createElement("span");
  meta.className = "saved-chart-meta";
  meta.textContent = [
    entry.id === activeId ? "編集中" : "",
    entry.chart.difficulty,
    entry.chart.beat,
    `${barCount} 小節`,
    `更新 ${formatTimestamp(entry.updatedAt)}`,
  ].filter(Boolean).join(" · ");
  info.append(name, meta);

  if (entry.id === renamingId) {
    item.append(info, createRenameForm(entry, handlers));
    return item;
  }

  const actions = document.createElement("div");
  actions.className = "saved-chart-actions";
  actions.append(
    createButton(
      "読み込む",
      "secondary-button",
      () => handlers.onLoad(entry.id),
    ),
    createButton(
      "名前を変更",
      "secondary-button",
      () => handlers.onStartRename(entry.id),
    ),
    createButton(
      "削除",
      "secondary-button",
      () => handlers.onDelete(entry.id),
    ),
  );
  item.append(info, actions);
  return item;
}

/**
 * Renders the saved chart list and enables or disables the save button.
 * @param {object[]} entries Saved chart entries, in display order.
 * @param {{activeId: string|null, renamingId: string|null, available: boolean}} view
 * @param {{onLoad: Function, onStartRename: Function, onRename: Function,
 *   onCancelRename: Function, onDelete: Function}} handlers
 */
export function renderSavedCharts(entries, view, handlers) {
  const list = document.getElementById("saved-chart-list");
  document.getElementById("save-chart").disabled = !view.available;
  if (!entries.length) {
    const empty = document.createElement("li");
    empty.className = "saved-chart-empty";
    empty.textContent = view.available
      ? "保存した譜面はまだありません。「新しい譜面として保存」で追加できます。"
      : "このブラウザーでは保存機能を使えません。";
    list.replaceChildren(empty);
    return;
  }
  list.replaceChildren(
    ...entries.map((entry) => createEntryItem(entry, view, handlers)),
  );
}

/**
 * Shows a status message under the saved chart list.
 * @param {string} message Text to display.
 * @param {boolean} isError Whether to use the error style.
 */
export function setSavedChartStatus(message, isError) {
  const status = document.getElementById("saved-chart-status");
  status.textContent = message;
  status.classList.toggle("error", isError);
}

/**
 * Binds the save button.
 * @param {{onSave: Function}} handlers
 */
export function bindSavedCharts({ onSave }) {
  document.getElementById("save-chart").addEventListener("click", onSave);
}
