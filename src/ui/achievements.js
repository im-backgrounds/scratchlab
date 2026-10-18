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

export function bindAchievements({ onDismiss }) {
  document.getElementById("achievement-notification-dismiss").addEventListener(
    "click",
    onDismiss,
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
