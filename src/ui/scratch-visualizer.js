export function buildScratchVisualizer(steps, chartOptions = {}, playbackState = {}) {
  const width = 780;
  const height = 220;
  const left = 24;
  const right = width - 12;
  const top = 18;
  const bottom = height - 18;
  const plotWidth = right - left;
  const plotHeight = bottom - top;
  const cellWidth = plotWidth / Math.max(steps.length, 1);
  const directions = [];
  let lastDirection = -1;

  steps.forEach((step) => {
    if (step === "L") lastDirection = -1;
    if (step === "R") lastDirection = 1;
    directions.push(step === "-" || step === "M" ? 0 : lastDirection);
  });

  let grid = "";
  const scoreGrid = chartOptions.scoreData || chartOptions.scoreGrid;
  if (scoreGrid) {
    const { totalTicks, ticksPerBar, beatsPerBar } = scoreGrid;
    const ticksPerBeat = ticksPerBar / beatsPerBar;
    for (let tick = 0; tick <= totalTicks; tick += 1) {
      const x = left + (plotWidth * tick) / totalTicks;
      const isBar = tick % ticksPerBar === 0;
      const isBeat = tick % ticksPerBeat === 0;
      grid += `<line x1="${x}" y1="${top}" x2="${x}" y2="${bottom}" stroke="${isBar ? "rgba(210,230,246,0.34)" : isBeat ? "rgba(210,230,246,0.22)" : "rgba(210,230,246,0.14)"}" stroke-width="${isBar ? 1.5 : 1}" stroke-dasharray="${isBar ? "none" : "1 4"}" />`;
    }
  } else {
    for (let division = 0; division <= steps.length * 2; division += 1) {
      const x = left + (plotWidth * division) / (steps.length * 2);
      const isBar = division % 16 === 0;
      const isBeat = division % 4 === 0;
      grid += `<line x1="${x}" y1="${top}" x2="${x}" y2="${bottom}" stroke="${isBar ? "rgba(210,230,246,0.34)" : isBeat ? "rgba(210,230,246,0.22)" : "rgba(210,230,246,0.14)"}" stroke-width="${isBar ? 1.5 : 1}" stroke-dasharray="${isBar ? "none" : "1 4"}" />`;
    }
  }
  for (let division = 0; division <= 8; division += 1) {
    const y = top + (plotHeight * division) / 8;
    const isEdge = division === 0 || division === 8;
    grid += `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="${isEdge ? "rgba(210,230,246,0.3)" : "rgba(210,230,246,0.16)"}" stroke-width="1" stroke-dasharray="1 4" />`;
  }

  const strokes = [];
  const faderMarks = [];
  if (chartOptions.scoreData) {
    const scoreData = chartOptions.scoreData;
    let faderOpen = true;
    let eventIndex = 0;
    while (eventIndex < scoreData.events.length) {
      const firstEvent = scoreData.events[eventIndex];
      const firstX = left + (plotWidth * firstEvent.startTick) / scoreData.totalTicks;
      const direction = firstEvent.direction === "F" ? -1 : 1;
      const yStart = direction < 0 ? bottom : top;
      const yEnd = direction < 0 ? top : bottom;

      if (!firstEvent.faderOpen) {
        if (faderOpen) {
          const previousEvent = scoreData.events[eventIndex - 1];
          const followsOpenStroke = previousEvent
            && previousEvent.faderOpen
            && previousEvent.startTick + previousEvent.durationTicks === firstEvent.startTick;
          const closeY = followsOpenStroke
            ? (previousEvent.direction === "F" ? top : bottom)
            : yStart;
          faderMarks.push(`<line class="fader-close" x1="${firstX - 7}" y1="${closeY}" x2="${firstX + 7}" y2="${closeY}" />`);
        }
        faderOpen = false;
        eventIndex += 1;
        continue;
      }

      const previousEvent = scoreData.events[eventIndex - 1];
      const opensAfterCut = previousEvent?.cutCount > 0;
      if (!faderOpen || opensAfterCut) {
        faderMarks.push(`<line class="fader-open" x1="${firstX - 7}" y1="${yStart}" x2="${firstX + 7}" y2="${yStart}" />`);
      }
      faderOpen = true;

      const runStartTick = firstEvent.startTick;
      let runEndIndex = eventIndex;
      let runEndTick = firstEvent.startTick + firstEvent.durationTicks;
      while (runEndIndex + 1 < scoreData.events.length) {
        const nextEvent = scoreData.events[runEndIndex + 1];
        if (!nextEvent.faderOpen || nextEvent.direction !== firstEvent.direction || nextEvent.startTick !== runEndTick) break;
        runEndIndex += 1;
        runEndTick = nextEvent.startTick + nextEvent.durationTicks;
      }

      const yAtTick = (tick) => yStart + ((yEnd - yStart) * (tick - runStartTick)) / (runEndTick - runStartTick);

      for (let currentIndex = eventIndex; currentIndex <= runEndIndex; currentIndex += 1) {
        const event = scoreData.events[currentIndex];
        const eventEndTick = event.startTick + event.durationTicks;
        const lineEndTick = event.modifier === "C" && currentIndex + 1 < scoreData.events.length
          ? event.startTick + event.durationTicks * 0.82
          : eventEndTick;
        const eventStartX = left + (plotWidth * event.startTick) / scoreData.totalTicks;
        const eventEndX = left + (plotWidth * lineEndTick) / scoreData.totalTicks;
        strokes.push(`<path d="M ${eventStartX} ${yAtTick(event.startTick)} L ${eventEndX} ${yAtTick(lineEndTick)}" />`);

        for (let mark = 0; mark < event.cutCount; mark += 1) {
          const x = left + (plotWidth * event.startTick) / scoreData.totalTicks;
          const y = yAtTick(event.startTick);
          faderMarks.push(`<line x1="${x - 7}" y1="${y}" x2="${x + 7}" y2="${y}" />`);
        }
      }
      eventIndex = runEndIndex + 1;
    }
  } else if (chartOptions.scoreMode === "transformer") {
    const strokeLength = chartOptions.strokeLength || 4;
    const segmentCount = chartOptions.cutCount ? chartOptions.cutCount + 1 : 4;
    for (let start = 0; start < steps.length; start += strokeLength) {
      const direction = steps[start] === "L" ? -1 : 1;
      const xStart = left + start * cellWidth;
      const xEnd = left + Math.min(start + strokeLength, steps.length) * cellWidth;
      const yStart = direction < 0 ? bottom : top;
      const yEnd = direction < 0 ? top : bottom;

      for (let segment = 0; segment < segmentCount; segment += 1) {
        const tStart = (segment + 0.08) / segmentCount;
        const tEnd = (segment + 0.92) / segmentCount;
        const dashStartX = xStart + (xEnd - xStart) * tStart;
        const dashStartY = yStart + (yEnd - yStart) * tStart;
        const dashEndX = xStart + (xEnd - xStart) * tEnd;
        const dashEndY = yStart + (yEnd - yStart) * tEnd;
        strokes.push(`<path d="M ${dashStartX} ${dashStartY} L ${dashEndX} ${dashEndY}" />`);
      }
    }
  } else if (chartOptions.scoreMode === "forward" || chartOptions.scoreMode === "backward") {
    const isForward = chartOptions.scoreMode === "forward";
    const strokeType = isForward ? "L" : "R";
    steps.forEach((step, index) => {
      if (step !== strokeType) return;
      const xStart = left + index * cellWidth;
      const xEnd = xStart + cellWidth;
      const yStart = isForward ? bottom : top;
      const yEnd = isForward ? top : bottom;
      strokes.push(`<path d="M ${xStart} ${yStart} L ${xEnd} ${yEnd}" />`);
      faderMarks.push(`<line class="fader-open" x1="${xStart - 7}" y1="${yStart}" x2="${xStart + 7}" y2="${yStart}" />`);
      faderMarks.push(`<line class="fader-close" x1="${xEnd - 7}" y1="${yEnd}" x2="${xEnd + 7}" y2="${yEnd}" />`);
    });
  } else {
    let index = 0;
    while (index < steps.length) {
      const direction = directions[index];
      if (direction === 0) {
        index += 1;
        continue;
      }

      const start = index;
      while (index + 1 < steps.length && directions[index + 1] === direction) {
        index += 1;
      }
      const end = index;
      const xStart = left + start * cellWidth;
      const xEnd = left + (end + 1) * cellWidth;
      const yStart = direction < 0 ? bottom : top;
      const yEnd = direction < 0 ? top : bottom;
      strokes.push(`<path d="M ${xStart} ${yStart} L ${xEnd} ${yEnd}" />`);

      for (let stepIndex = start; stepIndex <= end; stepIndex += 1) {
        const step = steps[stepIndex];
        const markCount = step === "S" ? 3 : step === "C" ? 1 : 0;
        for (let mark = 0; mark < markCount; mark += 1) {
          const partPosition = (mark + 0.5) / (markCount + 1);
          const fraction = (stepIndex - start + partPosition) / (end - start + 1);
          const x = left + (stepIndex + partPosition) * cellWidth;
          const y = yStart + (yEnd - yStart) * fraction;
          faderMarks.push(`<line x1="${x - 7}" y1="${y}" x2="${x + 7}" y2="${y}" />`);
        }
      }
      index += 1;
    }
  }

  const activeCell = playbackState.isPlaying
    ? `<rect x="${left + playbackState.currentStep * (scoreGrid ? plotWidth / scoreGrid.totalTicks : cellWidth)}" y="${top}" width="${scoreGrid ? plotWidth / scoreGrid.totalTicks : cellWidth}" height="${plotHeight}" fill="rgba(111,228,255,0.08)" />`
    : "";

  return `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Scratch chart with time and record direction grid">
      ${activeCell}
      <g class="chart-grid-lines">${grid}</g>
      <g class="scratch-strokes">${strokes.join("")}</g>
      <g class="fader-marks">${faderMarks.join("")}</g>
    </svg>
  `;
}
