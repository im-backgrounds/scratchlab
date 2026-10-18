export function bindAudioMonitoring({
  onYouMute,
  onYouVolume,
}) {
  document.getElementById("you-mute").addEventListener(
    "change",
    (event) => onYouMute(event.target.checked),
  );
  document.getElementById("you-volume-slider").addEventListener(
    "input",
    (event) => onYouVolume(Number(event.target.value) / 100),
  );
}

export function renderAudioMonitoring({
  youMuted,
  youVolume,
  faderOpen,
  youPlaying,
}) {
  document.getElementById("you-mute").checked = youMuted;
  document.getElementById("you-volume-slider").value = String(
    Math.round(youVolume * 100),
  );
  document.getElementById("you-volume-value").textContent = `${
    Math.round(youVolume * 100)
  }%`;
  document.getElementById("you-source-status").textContent = youMuted
    ? `入力音：ミュート中${faderOpen ? "（フェーダー開）" : ""}`
    : youPlaying
    ? "入力音：再生中"
    : faderOpen
    ? "入力音：フェーダー開"
    : "入力音：フェーダー閉";
}
