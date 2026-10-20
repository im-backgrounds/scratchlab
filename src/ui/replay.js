export function bindReplay({ onPlay, onPause, onStop, onSeek }) {
  document.getElementById("replay-play").addEventListener("click", onPlay);
  document.getElementById("replay-pause").addEventListener("click", onPause);
  document.getElementById("replay-stop").addEventListener("click", onStop);
  const seek = document.getElementById("replay-seek");
  seek.addEventListener("input", () => onSeek(Number(seek.value)));
}

export function renderReplay(state, message = "") {
  document.getElementById("replay-current-time").textContent = state
    ? `${Math.floor(state.currentTime)} ms`
    : "—";
  document.getElementById("replay-current-loop").textContent =
    state?.currentLoop !== null && state?.currentLoop !== undefined
      ? `Loop ${state.currentLoop}`
      : "—";
  document.getElementById("replay-progress").textContent = state
    ? `${Math.floor(state.progress * 100)}%`
    : "—";
  document.getElementById("replay-status").textContent = message ||
    (!state
      ? "この譜面のReplayはありません。BPMチャレンジをクリアすると保存されます。"
      : state.isPlaying
      ? "再生中"
      : state.progress === 1
      ? "再生終了"
      : "停止中");
  document.getElementById("replay-play").disabled = !state || state.isPlaying ||
    state.progress === 1;
  document.getElementById("replay-pause").disabled = !state?.isPlaying;
  document.getElementById("replay-stop").disabled = !state;
  const seek = document.getElementById("replay-seek");
  seek.disabled = !state;
  seek.value = String(state?.progress ?? 0);
  seek.setAttribute(
    "aria-valuetext",
    state ? `${Math.floor(state.progress * 100)}%` : "Replayなし",
  );
}
