import { createReplayPlayback } from "../domain/replay-playback.js";
import { createReplayController } from "../domain/replay-controller.js";

export function createReplayView({
  replayUi,
  requestFrame = (callback) => requestAnimationFrame(callback),
  cancelFrame = (id) => cancelAnimationFrame(id),
  now = () => performance.now(),
}) {
  let controller = null;
  let duration = 0;
  let frame = null;
  let lastTime = null;
  let generation = 0;

  function cancel() {
    generation++;
    if (frame !== null) cancelFrame(frame);
    frame = null;
    lastTime = null;
  }

  function render() {
    const state = controller?.getState();
    replayUi.renderReplay(
      state
        ? {
          isPlaying: state.isPlaying,
          currentTime: state.currentTime,
          currentLoop: state.currentLoop,
          progress: state.progress,
        }
        : null,
    );
  }

  function schedule() {
    const token = generation;
    frame = requestFrame((time) => {
      if (token !== generation) return;
      frame = null;
      controller.tick(time - lastTime);
      lastTime = time;
      render();
      if (controller.getState().isPlaying) schedule();
      else cancel();
    });
  }

  const view = {
    setReplay(replay) {
      cancel();
      controller = null;
      duration = 0;
      if (replay !== null) {
        try {
          controller = createReplayController(createReplayPlayback(replay));
          duration = replay.replayContext.loopStates.at(-1).endTime -
            replay.replayContext.recordingStartedAt;
        } catch (error) {
          if (!(error instanceof TypeError)) throw error;
          console.warn("Replay Viewer could not load the recording", error);
          replayUi.renderReplay(null, "Replayを読み込めませんでした。");
          return;
        }
      }
      render();
    },
    play() {
      if (!controller || controller.getState().isPlaying) return;
      controller.play();
      render();
      if (controller.getState().isPlaying) {
        lastTime = now();
        schedule();
      }
    },
    pause() {
      cancel();
      controller?.pause();
      render();
    },
    stop() {
      cancel();
      controller?.stop();
      render();
    },
    seek(progress) {
      if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
        throw new TypeError(
          "Replay seek progress must be between zero and one",
        );
      }
      if (!controller) return;
      controller.seek(progress * duration);
      cancel();
      render();
      if (controller.getState().isPlaying) {
        lastTime = now();
        schedule();
      }
    },
  };
  replayUi.bindReplay({
    onPlay: view.play,
    onPause: view.pause,
    onStop: view.stop,
    onSeek: view.seek,
  });
  return view;
}
