const stepLabels = {
  L: "前進",
  R: "後進",
  M: "無音",
  C: "チョップ",
  K: "キープ",
  S: "3クリック",
};

export function renderBuilderEditor(
  state,
  { barCount, scoreDocument, scoreData, onStepClick },
) {
  const builderStepsEl = document.getElementById("builder-steps");
  builderStepsEl.innerHTML = "";
  const cellsPerBar = state.builderTicksPerBar;
  const notationLabels = Array(scoreData.totalTicks).fill("");
  scoreData.events.forEach((event) => {
    const notation = event.keep ? "K" : `${event.direction}${event.modifier}`;
    for (
      let tick = event.startTick;
      tick < event.startTick + event.durationTicks;
      tick += 1
    ) {
      notationLabels[tick] = notation;
    }
  });
  const bars = Math.ceil(state.builderSteps.length / cellsPerBar);

  for (let bar = 0; bar < bars; bar += 1) {
    const barEl = document.createElement("section");
    barEl.className = "builder-bar";
    const heading = document.createElement("h4");
    heading.textContent = `小節 ${bar + 1}`;
    const cells = document.createElement("div");
    cells.className = "builder-bar-cells";
    const barEnd = Math.min(state.builderSteps.length, (bar + 1) * cellsPerBar);
    for (let index = bar * cellsPerBar; index < barEnd; index += 1) {
      const step = state.builderSteps[index];
      const button = document.createElement("button");
      const notation = notationLabels[index] || (step === "-" ? "–" : step);
      const position = index - bar * cellsPerBar + 1;
      button.type = "button";
      button.className = `builder-step step-${
        step === "-" ? "continue" : step.toLowerCase()
      } ${index === state.currentStep && state.isPlaying ? "active" : ""}`;
      button.setAttribute(
        "aria-label",
        `小節 ${bar + 1}、位置 ${position}: ${notation || "空白"}（${
          stepLabels[step] || step
        }）`,
      );
      button.innerHTML = `<span>${notation}</span><small>${position}</small>`;
      button.title = `${notation} · ${stepLabels[step] || step} · 小節 ${
        bar + 1
      } · ${position}セル目`;
      button.addEventListener("click", () => onStepClick(index));
      cells.appendChild(button);
    }
    barEl.append(heading, cells);
    builderStepsEl.appendChild(barEl);
  }

  if (!state.builderJsonDirty) {
    document.getElementById("chart-json").value = JSON.stringify(
      scoreDocument,
      null,
      2,
    );
    setJsonStatus(
      "現在の譜面JSONです。編集後は「編集内容を反映」またはファイル保存ができます。",
      false,
    );
  }
  renderBuilderSummary(state, barCount);
  renderBuilderToolHint(state.builderSelectedType);
  document.getElementById("pattern-length").value = String(barCount);
}

function renderBuilderSummary(state, barCount) {
  const details = [
    ["譜面名", state.builderMetadata.name || "無題"],
    ["難易度", state.builderMetadata.difficulty || "未設定"],
    ["拍子", state.builderBeat],
    ["小節", `${barCount} 小節`],
  ];
  document.getElementById("builder-chart-info").replaceChildren(
    ...details.map(([label, value]) => {
      const item = document.createElement("div");
      item.className = "builder-info-item";
      const caption = document.createElement("span");
      caption.textContent = label;
      const content = document.createElement("strong");
      content.textContent = value;
      item.append(caption, content);
      return item;
    }),
  );

  const manualItems = [
    `${state.builderMetadata.name || "無題"}`,
    state.builderMetadata.difficulty || "難易度未設定",
    state.builderBeat,
    `${barCount} 小節`,
    `${state.builderTicksPerBar} セル / 小節`,
  ];
  document.getElementById("builder-manual-info").replaceChildren(
    ...manualItems.map((value) => {
      const item = document.createElement("span");
      item.textContent = value;
      return item;
    }),
  );
}

const toolHints = {
  L: "前進を選択中。時間セルをクリックして配置します。",
  R: "後進を選択中。時間セルをクリックして配置します。",
  M: "ミュートを選択中。時間セルをクリックして配置します。",
  C: "チョップを選択中。時間セルをクリックして配置します。",
  P: "フレアを選択中。時間セルをクリックして配置します。",
  K: "キープを選択中。時間セルをクリックして配置します。",
  S: "3クリックを選択中。時間セルをクリックして配置します。",
};

export function renderBuilderToolHint(stepType) {
  document.getElementById("builder-tool-hint").textContent =
    toolHints[stepType] || "";
}

export function renderBuilderMode(mode) {
  document.querySelectorAll(".builder-mode-tab").forEach((tab) => {
    const isActive = tab.id === `builder-${mode}-tab`;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
    tab.tabIndex = isActive ? 0 : -1;
  });
  document.querySelectorAll(".builder-mode-panel").forEach((panel) => {
    panel.hidden = panel.id !== `builder-${mode}-panel`;
  });
}

export function renderStepTypeSelection(stepType) {
  document.querySelectorAll(".step-type").forEach((button) => {
    const isSelected = button.dataset.stepType === stepType;
    button.classList.toggle("active", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });
}

export function bindEditor({
  onModeChange,
  onStepTypeChange,
  onPatternLengthChange,
  onRandomPattern,
  onManualFill,
  onImportJson,
  onExportJson,
  onJsonEdit,
  onJsonFileText,
  onJsonFileReadError,
}) {
  document.querySelectorAll(".builder-mode-tab").forEach((tab) => {
    tab.addEventListener(
      "click",
      () => onModeChange(tab.id.replace("builder-", "").replace("-tab", "")),
    );
  });
  document.querySelectorAll(".step-type").forEach((button) => {
    button.addEventListener(
      "click",
      () => onStepTypeChange(button.dataset.stepType),
    );
  });
  document.getElementById("pattern-length").addEventListener(
    "input",
    (event) => {
      onPatternLengthChange(Number(event.target.value));
    },
  );
  document.getElementById("random-pattern").addEventListener(
    "click",
    () =>
      onRandomPattern({
        difficulty: document.getElementById("generator-difficulty").value,
        minimumBeat: Number(
          document.getElementById("generator-min-beat").value,
        ),
        includeTriplets: document.getElementById("generator-triplets").checked,
        includeSyncopation:
          document.getElementById("generator-syncopation").checked,
        includeChops: document.getElementById("generator-chops").checked,
        includeFlares: document.getElementById("generator-flares").checked,
        includeKeeps: document.getElementById("generator-keeps").checked,
      }),
  );
  document.getElementById("manual-fill").addEventListener(
    "click",
    onManualFill,
  );
  document.getElementById("import-json").addEventListener(
    "click",
    onImportJson,
  );
  document.getElementById("export-json").addEventListener(
    "click",
    onExportJson,
  );
  document.getElementById("chart-json").addEventListener("input", onJsonEdit);

  const fileInput = document.getElementById("chart-json-file");
  document.getElementById("json-load-file").addEventListener(
    "click",
    () => fileInput.click(),
  );
  fileInput.addEventListener("change", async () => {
    const [file] = fileInput.files || [];
    if (!file) return;
    try {
      onJsonFileText(await file.text());
    } catch (error) {
      onJsonFileReadError(error);
    } finally {
      fileInput.value = "";
    }
  });

  return {
    getJsonText: () => document.getElementById("chart-json").value,
    setJsonText: (text) => {
      document.getElementById("chart-json").value = text;
    },
    downloadJson: (data, filename) => {
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  };
}

export function setJsonStatus(message, isError) {
  const status = document.getElementById("json-status");
  status.textContent = message;
  status.classList.toggle("error", isError);
}
