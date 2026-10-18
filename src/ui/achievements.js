const GROUPS = [
  ["bpm", "BPM達成"],
  ["practice", "練習回数"],
  ["streak", "連続練習日数"],
];

const LIST_IDS = {
  bpm: "achievement-bpm-list",
  practice: "achievement-practice-list",
  streak: "achievement-streak-list",
};

export function bindAchievements({ onDismiss, onClearHistory }) {
  document.getElementById("achievement-notification-dismiss").addEventListener(
    "click",
    onDismiss,
  );
  document.getElementById("practice-history-clear").addEventListener(
    "click",
    () => {
      if (
        globalThis.confirm(
          "練習履歴と実績をすべて削除します。練習回数・連続練習日数と、履歴に基づく分析もリセットされます。この操作は取り消せません。削除しますか？",
        )
      ) onClearHistory();
    },
  );
}

export function renderPracticeHistory(sessions, canClear, charts) {
  document.getElementById("practice-history-clear").disabled = !canClear;
  document.getElementById("practice-history-empty").hidden =
    sessions.length > 0;
  const ordered = [...sessions].sort(
    (a, b) => Date.parse(b.date) - Date.parse(a.date),
  );
  document.getElementById("practice-history-list").replaceChildren(
    ...ordered.map((session) => {
      const item = document.createElement("li");
      const pattern = charts.find((chart) =>
        chart.id === session.pattern
      )?.name ??
        session.pattern;
      item.textContent = `${
        new Date(session.date).toLocaleString("ja-JP")
      } · ${pattern} · ${session.bpm} BPM · 一致率 ${
        session.accuracy.toFixed(1)
      }%`;
      return item;
    }),
  );
}

export function renderAchievements(achievements, statusMessage = "") {
  for (const [category] of GROUPS) {
    const list = document.getElementById(LIST_IDS[category]);
    const items = achievements.filter((item) => item.category === category);
    list.replaceChildren(...items.map((item) => {
      const card = document.createElement("li");
      card.className = "achievement-item";
      card.dataset.earned = String(item.earned);

      const title = document.createElement("h4");
      title.textContent = item.title;
      const description = document.createElement("p");
      description.textContent = item.description;
      const progress = document.createElement("p");
      progress.className = "achievement-progress";
      progress.textContent = item.progressText;
      const state = document.createElement("strong");
      state.className = "achievement-state";
      state.textContent = item.earned ? "達成" : "未達成";

      card.append(title, description, progress, state);
      return card;
    }));
  }
  const status = document.getElementById("achievement-status");
  status.textContent = statusMessage;
  status.hidden = !statusMessage;
}

export function renderAchievementNotification(titles) {
  const notification = document.getElementById("achievement-notification");
  document.getElementById("achievement-notification-text").textContent =
    `実績を達成しました：${titles.join("、")}`;
  notification.hidden = titles.length === 0;
}

export function dismissAchievementNotification() {
  document.getElementById("achievement-notification").hidden = true;
}
