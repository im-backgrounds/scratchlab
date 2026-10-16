const NOTE_VALUES = [
  { beats: 4, flags: 0, hollow: true, stem: false },
  { beats: 2, flags: 0, hollow: true, stem: true },
  { beats: 1, flags: 0, hollow: false, stem: true },
  { beats: 0.5, flags: 1, hollow: false, stem: true },
  { beats: 0.25, flags: 2, hollow: false, stem: true },
  { beats: 0.125, flags: 3, hollow: false, stem: true },
];

function describeNoteLength(beats) {
  const epsilon = 1e-6;
  for (const value of NOTE_VALUES) {
    if (Math.abs(beats - value.beats) < epsilon) return { ...value, dots: 0, tuplet: 0 };
    if (Math.abs(beats - value.beats * 1.5) < epsilon) return { ...value, dots: 1, tuplet: 0 };
  }
  for (const value of NOTE_VALUES) {
    const ratio = beats / value.beats;
    for (const tuplet of [3, 5, 6, 7]) {
      const base = tuplet === 3 ? 2 : 4;
      if (Math.abs(ratio - base / tuplet) < epsilon) return { ...value, dots: 0, tuplet };
    }
  }
  const nearest = NOTE_VALUES.reduce((best, value) => (Math.abs(value.beats - beats) < Math.abs(best.beats - beats) ? value : best));
  return { ...nearest, dots: 0, tuplet: 0 };
}

function pickNoteLength(beats) {
  const epsilon = 1e-6;
  const lengths = NOTE_VALUES.flatMap((value) => [value.beats * 1.5, value.beats]).sort((a, b) => b - a);
  const exact = lengths.find((length) => Math.abs(length - beats) < epsilon);
  if (exact) return exact;
  const tuplet = describeNoteLength(beats);
  if (tuplet.tuplet) return beats;
  return lengths.find((length) => length < beats) ?? null;
}

function buildRest(note, x, lineY) {
  if (note.beats >= 4) return `<rect class="rhythm-rest" x="${x - 5}" y="${lineY}" width="10" height="4" />`;
  if (note.beats >= 2) return `<rect class="rhythm-rest" x="${x - 5}" y="${lineY - 4}" width="10" height="4" />`;
  if (note.flags === 0) {
    return `<path class="rhythm-rest-line" d="M ${x - 2} ${lineY - 9} L ${x + 3} ${lineY - 4} L ${x - 2} ${lineY + 1} L ${x + 3} ${lineY + 6} Q ${x - 3} ${lineY + 5} ${x - 1} ${lineY + 10}" />`;
  }
  let glyph = `<line class="rhythm-rest-line" x1="${x + 3}" y1="${lineY - 9}" x2="${x - 2}" y2="${lineY + 9}" />`;
  for (let flag = 0; flag < note.flags; flag += 1) {
    const y = lineY - 5 + flag * 5;
    glyph += `<circle class="rhythm-dot" cx="${x - 3}" cy="${y}" r="1.6" /><path class="rhythm-rest-line" d="M ${x - 3} ${y} Q ${x + 1} ${y} ${x + 3 - flag * 1.2} ${y - 3}" />`;
  }
  return glyph;
}

function buildRhythmStaff(scoreData, left, plotWidth, staffTop) {
  const lineY = staffTop + 30;
  const ticksPerBeat = scoreData.ticksPerBar / scoreData.beatsPerBar;
  let svg = `<line class="rhythm-staff-line" x1="${left}" y1="${lineY}" x2="${left + plotWidth}" y2="${lineY}" />`;
  for (let tick = 0; tick <= scoreData.totalTicks; tick += scoreData.ticksPerBar) {
    const x = left + (plotWidth * tick) / scoreData.totalTicks;
    svg += `<line class="rhythm-barline" x1="${x}" y1="${lineY - 8}" x2="${x}" y2="${lineY + 8}" />`;
  }

  const stemTop = lineY - 24;
  const items = [];
  const groups = [];
  scoreData.events.forEach((event) => {
    const previous = groups[groups.length - 1];
    const joins = previous
      && event.faderOpen && previous.faderOpen
      && previous.direction === event.direction
      && previous.cutCount === 0 && event.cutCount === 0
      && event.modifier !== "O"
      && previous.startTick + previous.durationTicks === event.startTick;
    const joinsRest = previous
      && !event.faderOpen && !previous.faderOpen
      && previous.startTick + previous.durationTicks === event.startTick
      && event.startTick % scoreData.ticksPerBar !== 0;
    const crossesBar = joins && event.startTick % scoreData.ticksPerBar === 0;
    if (joinsRest || (joins && !crossesBar)) previous.durationTicks += event.durationTicks;
    else groups.push({ ...event, slurred: crossesBar });
  });

  // A continuous sound is one note; lengths with no single note value are tied pieces.
  groups.forEach((event) => {
    let remaining = event.durationTicks / ticksPerBeat;
    let tick = event.startTick;
    let first = true;
    while (remaining > 1e-6) {
      const piece = pickNoteLength(remaining) ?? remaining;
      items.push({
        event: { ...event, startTick: tick, durationTicks: piece * ticksPerBeat },
        note: describeNoteLength(piece),
        x: left + (plotWidth * tick) / scoreData.totalTicks + 5,
        tied: !first || event.slurred,
      });
      tick += piece * ticksPerBeat;
      remaining -= piece;
      first = false;
    }
  });
  const isBeamable = (item) => item.event.faderOpen && item.note.flags > 0 && item.note.tuplet > 0;

  // Contiguous audible short notes within one bar share beams instead of flags.
  const beamed = new Set();
  let runStart = 0;
  while (runStart < items.length) {
    if (!isBeamable(items[runStart])) {
      runStart += 1;
      continue;
    }
    let runEnd = runStart;
    while (runEnd + 1 < items.length && isBeamable(items[runEnd + 1])
      && items[runEnd].event.startTick + items[runEnd].event.durationTicks === items[runEnd + 1].event.startTick
      && items[runEnd].event.direction === items[runEnd + 1].event.direction
      && Math.floor(items[runEnd].event.startTick / scoreData.ticksPerBar) === Math.floor(items[runEnd + 1].event.startTick / scoreData.ticksPerBar)) {
      runEnd += 1;
    }
    if (runEnd > runStart) {
      for (let index = runStart; index <= runEnd; index += 1) beamed.add(index);
      const maxLevel = Math.max(...items.slice(runStart, runEnd + 1).map((item) => item.note.flags));
      for (let level = 0; level < maxLevel; level += 1) {
        const y = stemTop + level * 5;
        let segmentStart = null;
        for (let index = runStart; index <= runEnd + 1; index += 1) {
          const has = index <= runEnd && items[index].note.flags > level;
          if (has && segmentStart === null) segmentStart = index;
          if (!has && segmentStart !== null) {
            const from = items[segmentStart].x + 3.5;
            // A lone short note in a run gets a stub toward its neighbour.
            const to = segmentStart === index - 1
              ? (segmentStart === runStart ? from + 8 : from - 8)
              : items[index - 1].x + 3.5;
            svg += `<line class="rhythm-beam" x1="${Math.min(from, to)}" y1="${y}" x2="${Math.max(from, to)}" y2="${y}" />`;
            segmentStart = null;
          }
        }
      }
    }
    runStart = runEnd + 1;
  }

  items.forEach(({ event, note, x }, index) => {
    if (!event.faderOpen) {
      svg += buildRest(note, x, lineY);
    } else {
      svg += `<ellipse class="rhythm-head${note.hollow ? " hollow" : ""}" cx="${x}" cy="${lineY}" rx="4" ry="3" />`;
      if (note.stem) {
        svg += `<line class="rhythm-stem" x1="${x + 3.5}" y1="${lineY}" x2="${x + 3.5}" y2="${stemTop}" />`;
        for (let flag = 0; !beamed.has(index) && flag < note.flags; flag += 1) {
          const y = stemTop + flag * 5;
          svg += `<path class="rhythm-flag" d="M ${x + 3.5} ${y} q 6 4 4 10" />`;
        }
      }
    }
    if (items[index].tied) {
      const prevX = items[index - 1].x;
      svg += `<path class="rhythm-tie" d="M ${prevX} ${lineY + 6} Q ${(prevX + x) / 2} ${lineY + 14} ${x} ${lineY + 6}" />`;
    }
    if (note.dots) svg += `<circle class="rhythm-dot" cx="${x + 9}" cy="${lineY - 2}" r="1.5" />`;
    if (note.tuplet) svg += `<text class="rhythm-tuplet" x="${x}" y="${stemTop - 6}" text-anchor="middle">${note.tuplet}</text>`;
  });
  return svg;
}

export function buildScratchVisualizer(steps, chartOptions = {}, playbackState = {}) {
  const width = 780;
  const staffHeight = chartOptions.scoreData ? 60 : 0;
  const height = 220 + staffHeight;
  const left = 24;
  const right = width - 12;
  const top = 18 + staffHeight;
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
      // Muted events in the same direction stay on the same diagonal when sound resumes in that direction.
      while (runEndIndex + 1 < scoreData.events.length) {
        let probeIndex = runEndIndex + 1;
        let probeTick = runEndTick;
        while (probeIndex < scoreData.events.length) {
          const probe = scoreData.events[probeIndex];
          if (probe.faderOpen || probe.direction !== firstEvent.direction || probe.startTick !== probeTick) break;
          probeTick = probe.startTick + probe.durationTicks;
          probeIndex += 1;
        }
        const nextEvent = scoreData.events[probeIndex];
        if (!nextEvent || !nextEvent.faderOpen || nextEvent.direction !== firstEvent.direction || nextEvent.startTick !== probeTick) break;
        runEndIndex = probeIndex;
        runEndTick = nextEvent.startTick + nextEvent.durationTicks;
      }

      const yAtTick = (tick) => yStart + ((yEnd - yStart) * (tick - runStartTick)) / (runEndTick - runStartTick);

      for (let currentIndex = eventIndex; currentIndex <= runEndIndex; currentIndex += 1) {
        const event = scoreData.events[currentIndex];
        const eventEndTick = event.startTick + event.durationTicks;
        if (!event.faderOpen) {
          if (faderOpen) {
            const x = left + (plotWidth * event.startTick) / scoreData.totalTicks;
            const y = yAtTick(event.startTick);
            faderMarks.push(`<line class="fader-close" x1="${x - 7}" y1="${y}" x2="${x + 7}" y2="${y}" />`);
          }
          faderOpen = false;
          continue;
        }
        if (!faderOpen) {
          const x = left + (plotWidth * event.startTick) / scoreData.totalTicks;
          const y = yAtTick(event.startTick);
          faderMarks.push(`<line class="fader-open" x1="${x - 7}" y1="${y}" x2="${x + 7}" y2="${y}" />`);
          faderOpen = true;
        }
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
    <svg viewBox="0 0 ${width} ${height}" style="height:${height}px" preserveAspectRatio="none" role="img" aria-label="Scratch chart with time and record direction grid">
      ${activeCell}
      ${chartOptions.scoreData ? `<g class="rhythm-staff">${buildRhythmStaff(chartOptions.scoreData, left, plotWidth, 10)}</g>` : ""}
      <g class="chart-grid-lines">${grid}</g>
      <g class="scratch-strokes">${strokes.join("")}</g>
      <g class="fader-marks">${faderMarks.join("")}</g>
    </svg>
  `;
}
