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

export function renderPracticeGrowth(sessions) {
  const days = new Map();
  for (const session of sessions) {
    const date = new Date(session.date);
    const key = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
    const day = days.get(key) ??
      { date: key, count: 0, bestBpm: 0, accuracyTotal: 0 };
    day.count += 1;
    day.bestBpm = Math.max(day.bestBpm, session.bpm);
    day.accuracyTotal += session.accuracy;
    days.set(key, day);
  }
  const ordered = [...days.values()].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  const container = document.getElementById("practice-growth-charts");
  container.replaceChildren();
  document.getElementById("practice-growth-empty").hidden = ordered.length > 0;
  if (!ordered.length) return;

  const metrics = [
    { title: "練習回数", unit: "回", value: (day) => day.count },
    { title: "最高練習BPM", unit: " BPM", value: (day) => day.bestBpm },
    {
      title: "平均一致率",
      unit: "%",
      value: (day) => day.accuracyTotal / day.count,
    },
  ];
  for (const metric of metrics) {
    const figure = document.createElement("figure");
    const caption = document.createElement("figcaption");
    caption.textContent = `${metric.title}（日別）`;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 600 180");
    svg.setAttribute("role", "img");
    const values = ordered.map(metric.value);
    const maximum = Math.max(1, ...values);
    const summary = ordered.map((day, index) =>
      `${day.date}: ${
        values[index].toFixed(metric.unit === "%" ? 1 : 0)
      }${metric.unit}`
    ).join("、");
    svg.setAttribute("aria-label", `${metric.title}。${summary}`);
    const points = values.map((value, index) => ({
      x: ordered.length === 1 ? 300 : 40 + index * 520 / (ordered.length - 1),
      y: 140 - value / maximum * 110,
    }));
    const line = document.createElementNS(svg.namespaceURI, "polyline");
    line.setAttribute(
      "points",
      points.map(({ x, y }) => `${x},${y}`).join(" "),
    );
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", "currentColor");
    line.setAttribute("stroke-width", "2");
    svg.append(line);
    for (
      const label of [
        {
          x: 40,
          y: 16,
          text: `縦軸上限 ${
            maximum.toFixed(metric.unit === "%" ? 1 : 0)
          }${metric.unit}`,
          anchor: "start",
        },
        { x: 40, y: 158, text: "0", anchor: "start" },
        { x: 40, y: 176, text: ordered[0].date, anchor: "start" },
        { x: 560, y: 176, text: ordered.at(-1).date, anchor: "end" },
      ]
    ) {
      const text = document.createElementNS(svg.namespaceURI, "text");
      text.setAttribute("x", String(label.x));
      text.setAttribute("y", String(label.y));
      text.setAttribute("fill", "currentColor");
      text.setAttribute("font-size", "12");
      text.setAttribute("text-anchor", label.anchor);
      text.textContent = label.text;
      svg.append(text);
    }
    points.forEach(({ x, y }, index) => {
      const dot = document.createElementNS(svg.namespaceURI, "circle");
      dot.setAttribute("cx", String(x));
      dot.setAttribute("cy", String(y));
      dot.setAttribute("r", "3");
      dot.setAttribute("fill", "currentColor");
      const title = document.createElementNS(svg.namespaceURI, "title");
      title.textContent = `${ordered[index].date}: ${
        values[index].toFixed(metric.unit === "%" ? 1 : 0)
      }${metric.unit}`;
      dot.append(title);
      svg.append(dot);
    });
    const details = document.createElement("details");
    const heading = document.createElement("summary");
    heading.textContent = "日別の数値を表示";
    const text = document.createElement("p");
    text.textContent = summary;
    details.append(heading, text);
    figure.append(caption, svg, details);
    container.append(figure);
  }
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
