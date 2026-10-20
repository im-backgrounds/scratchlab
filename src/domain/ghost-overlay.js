import { getEventKind } from "./performance-analysis.js";
import { isEventInLoop } from "./playback.js";

const MEANING_KINDS = ["forward", "backward", "faderOpen", "faderClosed"];

/**
 * Projects a Ghost using its original recording's loop context, without scoring.
 * timeMs is loop-relative; position is the score-relative fraction, capped at 1.
 * @param {{recordedTimeline: object[]}|null} selectedGhost
 * @param {object[]} loopStates Original recording loop states.
 * @param {number} bpm Original recording BPM.
 * @param {{totalTicks: number, tickDurationSeconds: number}} scoreData
 */
export function createGhostOverlayData(
  selectedGhost,
  loopStates,
  bpm,
  scoreData,
) {
  if (selectedGhost === null || selectedGhost === undefined) return null;
  const invalid = () => {
    console.warn(
      "Ghost overlay data could not be generated: invalid context or timeline",
    );
    return null;
  };
  if (
    !Array.isArray(selectedGhost.recordedTimeline) ||
    !Array.isArray(loopStates) || loopStates.length === 0 ||
    !Number.isFinite(bpm) || bpm <= 0 ||
    !Number.isFinite(scoreData?.totalTicks) || scoreData.totalTicks <= 0 ||
    !Number.isFinite(scoreData?.tickDurationSeconds) ||
    scoreData.tickDurationSeconds <= 0
  ) return invalid();
  const durationMs = scoreData.totalTicks * scoreData.tickDurationSeconds *
    60000 / bpm;
  if (!Number.isFinite(durationMs) || durationMs <= 0) return invalid();
  const indices = new Set();
  let previousEnd = -Infinity;
  for (const loop of loopStates) {
    if (
      !loop || !Number.isInteger(loop.loopIndex) || loop.loopIndex < 0 ||
      indices.has(loop.loopIndex) ||
      !["recording", "demo"].includes(loop.phase) ||
      !Number.isFinite(loop.startTime) || !Number.isFinite(loop.endTime) ||
      loop.startTime < 0 || loop.startTime < previousEnd ||
      loop.endTime <= loop.startTime
    ) return invalid();
    indices.add(loop.loopIndex);
    previousEnd = loop.endTime;
  }
  const events = [];
  let previousTime = -Infinity;
  for (const event of selectedGhost.recordedTimeline) {
    if (!event || typeof event !== "object") return invalid();
    if (event.type === "stop" || event.type === "loop-boundary") continue;
    const kind = getEventKind(event);
    if (
      !MEANING_KINDS.includes(kind) || !Number.isFinite(event.time) ||
      event.time < 0 || event.time < previousTime
    ) return invalid();
    previousTime = event.time;
    const loop = loopStates.find((item) =>
      item.phase === "recording" && isEventInLoop(event, item)
    );
    if (!loop) continue;
    const timeMs = event.time - loop.startTime;
    events.push({
      kind,
      timeMs,
      position: Math.min(1, timeMs / durationMs),
      loopIndex: loop.loopIndex,
    });
  }
  return { events };
}
