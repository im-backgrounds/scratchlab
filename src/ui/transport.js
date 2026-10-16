export function renderTransport(state, builderBarCount) {
  document.getElementById("bpm-value").textContent = `${state.bpm}`;
  document.getElementById("bpm-slider").value = String(state.bpm);
  document.getElementById("volume-value").textContent = `${
    Math.round(state.volume * 100)
  }%`;
  document.getElementById("click-volume-value").textContent = `${
    Math.round(state.clickVolume * 100)
  }%`;
  document.getElementById("pattern-length-value").textContent =
    `${builderBarCount}`;
  document.getElementById("pattern-length").value = String(builderBarCount);
}

/** Locks the BPM slider while a challenge fixes the tempo. */
export function setBpmLocked(locked) {
  document.getElementById("bpm-slider").disabled = locked;
}

export function bindTransport({
  onPlay,
  onBpmChange,
  onVolumeChange,
  onRepeatChange,
  onClickEnabledChange,
  onClickIntervalChange,
  onClickVolumeChange,
}) {
  document.getElementById("play-toggle").addEventListener("click", () => {
    onPlay(!document.getElementById("builder-page").hidden);
  });
  document.getElementById("bpm-slider").addEventListener("input", (event) => {
    onBpmChange(Number(event.target.value));
  });
  document.getElementById("volume-slider").addEventListener(
    "input",
    (event) => {
      onVolumeChange(Number(event.target.value) / 100);
    },
  );
  document.getElementById("repeat-toggle").addEventListener(
    "change",
    (event) => {
      onRepeatChange(event.target.checked);
    },
  );
  document.getElementById("click-toggle").addEventListener(
    "change",
    (event) => {
      onClickEnabledChange(event.target.checked);
    },
  );
  document.querySelectorAll('input[name="click-division"]').forEach((input) => {
    input.addEventListener("change", (event) => {
      if (event.target.checked) {
        onClickIntervalChange(Number(event.target.value));
      }
    });
  });
  document.getElementById("click-volume-slider").addEventListener(
    "input",
    (event) => {
      onClickVolumeChange(Number(event.target.value) / 100);
    },
  );
}
