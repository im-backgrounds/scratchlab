import { buildScratchVisualizer } from "./scratch-visualizer.js";

export function renderChartList(charts, selectedChartId, onSelect) {
  const chartListEl = document.getElementById("chart-list");
  chartListEl.innerHTML = "";
  charts.forEach((chart) => {
    const item = document.createElement("li");
    item.innerHTML = `
      <button class="chart-item ${
      chart.id === selectedChartId ? "active" : ""
    }" data-chart-id="${chart.id}">
        <div class="chart-item-header">
          <span class="chart-item-name">${chart.name}</span>
          <span class="chart-item-level difficulty-${chart.difficulty.toLowerCase()}">${chart.difficulty}</span>
        </div>
        <p class="chart-item-desc">${chart.description}</p>
      </button>
    `;
    item.querySelector(".chart-item").addEventListener(
      "click",
      () => onSelect(chart.id),
    );
    chartListEl.appendChild(item);
  });
}

export function renderSelectedChart(chart, state) {
  document.getElementById("chart-title").textContent = chart.name;
  document.getElementById("chart-description").textContent = chart.description;
  const difficulty = document.getElementById("chart-difficulty");
  difficulty.textContent = chart.difficulty;
  difficulty.className =
    `status-pill difficulty-${chart.difficulty.toLowerCase()}`;
  document.getElementById("chart-help-title").textContent =
    `${chart.name}の見方`;
  document.getElementById("chart-help-text").textContent = chart.guide;
  document.getElementById("chart-steps").innerHTML = buildScratchVisualizer(
    chart.steps,
    chart,
    state,
  );
}

export function renderBuilderScore(chart, state) {
  document.getElementById("builder-score").innerHTML = buildScratchVisualizer(
    chart.steps,
    chart,
    state,
  );
}
