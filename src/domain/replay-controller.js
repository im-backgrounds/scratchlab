/**
 * Advances a Replay only through explicit elapsed-time ticks.
 * @param {ReturnType<typeof import("./replay-playback.js").createReplayPlayback>} playback
 */
export function createReplayController(playback) {
  if (
    !playback || typeof playback.seek !== "function" ||
    typeof playback.reset !== "function" ||
    typeof playback.getState !== "function"
  ) throw new TypeError("A Replay Playback Model is required");

  let isPlaying = false;

  function getState() {
    return { isPlaying, ...playback.getState() };
  }

  return {
    play() {
      isPlaying = playback.getState().progress < 1;
      return getState();
    },
    pause() {
      isPlaying = false;
      return getState();
    },
    stop() {
      playback.reset();
      isPlaying = false;
      return getState();
    },
    seek(timeMs) {
      const state = playback.seek(timeMs);
      if (state.progress === 1) isPlaying = false;
      return getState();
    },
    tick(deltaMs) {
      if (!Number.isFinite(deltaMs) || deltaMs < 0) {
        throw new TypeError(
          "Replay tick delta must be a finite nonnegative number",
        );
      }
      if (isPlaying) {
        const time = playback.getState().currentTime + deltaMs;
        const state = playback.seek(Math.min(Number.MAX_VALUE, time));
        if (state.progress === 1) isPlaying = false;
      }
      return getState();
    },
    getState,
  };
}
