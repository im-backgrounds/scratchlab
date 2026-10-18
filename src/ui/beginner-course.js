export function bindBeginnerCourse({ onSelectStage, onStart }) {
  document.getElementById("beginner-course-stages").addEventListener(
    "click",
    (event) => {
      const button = event.target.closest("[data-course-stage]");
      if (button && !button.disabled) onSelectStage(button.dataset.courseStage);
    },
  );
  document.getElementById("beginner-course-start").addEventListener(
    "click",
    onStart,
  );
}

export function renderBeginnerCourse({
  stages,
  completedStageIds,
  nextStageId,
  selectedStageId,
  message,
  canStart,
}) {
  const list = document.getElementById("beginner-course-stages");
  list.replaceChildren(...stages.map((stage, index) => {
    const completed = completedStageIds.includes(stage.id);
    const unlocked = completed || stage.id === nextStageId;
    const item = document.createElement("li");
    const button = document.createElement("button");
    const title = document.createElement("strong");
    const state = document.createElement("span");
    const detail = document.createElement("span");

    item.dataset.state = completed
      ? "completed"
      : unlocked
      ? "available"
      : "locked";
    button.type = "button";
    button.dataset.courseStage = stage.id;
    button.disabled = !unlocked;
    button.setAttribute("aria-pressed", String(stage.id === selectedStageId));
    title.textContent = `${index + 1}. ${stage.name}`;
    state.className = "beginner-course-stage-state";
    state.textContent = completed
      ? "完了・再挑戦できます"
      : unlocked
      ? "次の課題"
      : `ロック中：${stages[index - 1].name}をクリアすると解放`;
    detail.textContent = stage.targetBpm === null
      ? "練習テンポ"
      : `目標 ${stage.targetBpm} BPM`;
    button.append(title, state, detail);
    item.append(button);
    return item;
  }));

  const selected = stages.find((stage) => stage.id === selectedStageId);
  document.getElementById("beginner-course-selection").textContent = selected
    ? `${selected.name}${
      selected.targetBpm === null
        ? ` — 練習テンポ ${
          document.getElementById("bpm-value").textContent
        } BPM`
        : ` — 目標 ${selected.targetBpm} BPM`
    }。譜面は上の練習欄に表示されています。`
    : "次の課題を選ぶと譜面が読み込まれ、目標テンポと挑戦状況が表示されます。";
  document.getElementById("beginner-course-status").textContent = message;
  document.getElementById("beginner-course-start").disabled = !canStart;
}
