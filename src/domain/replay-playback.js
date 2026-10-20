import { getEventKind } from "./performance-analysis.js";
import { isEventInLoop } from "./playback.js";

const isTime = (value) => Number.isFinite(value) && value >= 0;

/**
 * Creates a timer-free playback cursor over a validated Replay recording.
 * Seek positions are recording-relative ms; event timestamps stay absolute.
 * @param {{chartId: string, bpm: number, replayContext: object, recordedTimeline: object[]}} replayRecord
 */
export function createReplayPlayback(replayRecord) {
  const context = replayRecord?.replayContext;
  if (
    typeof replayRecord?.chartId !== "string" ||
    !replayRecord.chartId.trim() ||
    !Number.isFinite(replayRecord.bpm) || replayRecord.bpm <= 0 ||
    !isTime(context?.recordingStartedAt) ||
    !Number.isInteger(context.recordingLoopCount) ||
    context.recordingLoopCount <= 0 ||
    !Array.isArray(context.loopStates) || context.loopStates.length === 0 ||
    !Array.isArray(replayRecord.recordedTimeline)
  ) throw new TypeError("Invalid Replay playback record");

  let previous = null;
  for (const loop of context.loopStates) {
    if (
      !loop || !Number.isInteger(loop.loopIndex) || loop.loopIndex < 0 ||
      !["demo", "recording"].includes(loop.phase) ||
      !isTime(loop.startTime) || !isTime(loop.endTime) ||
      loop.endTime <= loop.startTime ||
      (previous && (
        loop.loopIndex <= previous.loopIndex ||
        loop.startTime < previous.endTime
      ))
    ) throw new TypeError("Invalid Replay playback loops");
    previous = loop;
  }
  const recordingLoops = context.loopStates.filter((loop) =>
    loop.phase === "recording"
  );
  if (
    recordingLoops.length !== context.recordingLoopCount ||
    recordingLoops[0].startTime !== context.recordingStartedAt
  ) throw new TypeError("Replay recording context does not match its loops");

  let previousTime = -Infinity;
  for (const event of replayRecord.recordedTimeline) {
    if (
      !event || !isTime(event.time) || event.time < previousTime ||
      !(
        ["forward", "backward", "faderOpen", "faderClosed"].includes(
          getEventKind(event),
        ) || event.type === "stop" || event.type === "loop-boundary"
      )
    ) throw new TypeError("Invalid Replay playback timeline");
    previousTime = event.time;
  }

  const startedAt = context.recordingStartedAt;
  const loops = context.loopStates.map((loop) => ({ ...loop }));
  const endedAt = loops.at(-1).endTime;
  const duration = endedAt - startedAt;
  const timeline = structuredClone(replayRecord.recordedTimeline);
  let currentTime = 0;

  function getState() {
    const absoluteTime = startedAt + currentTime;
    const loop = currentTime === duration
      ? loops.at(-1)
      : loops.find((item) => isEventInLoop({ time: absoluteTime }, item));
    return {
      currentTime,
      currentLoop: loop?.loopIndex ?? null,
      progress: currentTime / duration,
      visibleEvents: structuredClone(
        timeline.filter((event) =>
          event.time >= startedAt && event.time <= absoluteTime
        ),
      ),
    };
  }

  return {
    seek(timeMs) {
      if (!Number.isFinite(timeMs)) {
        throw new TypeError("Replay seek time must be a finite number");
      }
      currentTime = Math.min(duration, Math.max(0, timeMs));
      return getState();
    },
    reset() {
      currentTime = 0;
      return getState();
    },
    getState,
  };
}
