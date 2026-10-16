/**
 * Owns the playback interval and its running state.
 * @returns {{isRunning: boolean, start: (intervalMs: number, onTick: () => void) => void, stop: () => void}}
 */
export function createPlaybackController() {
  let timerId = null;
  let running = false;

  return {
    get isRunning() {
      return running;
    },
    start(intervalMs, onTick) {
      if (timerId !== null) clearInterval(timerId);
      running = true;
      timerId = setInterval(() => {
        if (running) onTick();
      }, intervalMs);
      onTick();
    },
    stop() {
      if (timerId !== null) clearInterval(timerId);
      timerId = null;
      running = false;
    },
  };
}
