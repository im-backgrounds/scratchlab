const SCRATCH_KEYS = new Map([
  ["ArrowLeft", "forward"],
  ["ArrowRight", "backward"],
]);

function isEditableTarget(target) {
  return target instanceof Element &&
    (target.matches("input, textarea, select") ||
      target.isContentEditable);
}

export function bindKeyboardInput({
  target = globalThis.document,
  enabled = () => true,
  onEvent,
  onFaderStateChange = () => {},
}) {
  const heldScratchKeys = new Map();
  let spaceHeld = false;
  let faderState = "closed";

  const emit = (event) => onEvent({ ...event, time: Date.now() });
  const setFaderState = (state) => {
    faderState = state;
    onFaderStateChange(state);
  };

  const onKeyDown = (event) => {
    if (
      !enabled() || event.altKey || event.ctrlKey || event.metaKey ||
      event.shiftKey || isEditableTarget(event.target)
    ) return;

    const direction = SCRATCH_KEYS.get(event.code);
    if (direction) {
      event.preventDefault();
      if (event.repeat || heldScratchKeys.has(event.code)) return;
      heldScratchKeys.set(event.code, direction);
      emit({ type: "scratch", direction });
      return;
    }

    if (
      event.code !== "Space" || event.target instanceof Element &&
        event.target.closest("button, a, summary, [role='button']")
    ) return;
    event.preventDefault();
    if (event.repeat || spaceHeld) return;
    spaceHeld = true;
    if (faderState !== "open") {
      setFaderState("open");
      emit({ type: "fader", state: "open" });
    }
  };

  const onKeyUp = (event) => {
    if (isEditableTarget(event.target)) return;
    if (SCRATCH_KEYS.has(event.code) && heldScratchKeys.has(event.code)) {
      event.preventDefault();
      heldScratchKeys.delete(event.code);
      const remainingDirections = [...heldScratchKeys.values()];
      emit(
        remainingDirections.length
          ? { type: "scratch", direction: remainingDirections.at(-1) }
          : { type: "scratch", direction: "stop" },
      );
    } else if (event.code === "Space") {
      if (spaceHeld && faderState !== "closed") {
        setFaderState("closed");
        emit({ type: "fader", state: "closed" });
      }
      spaceHeld = false;
    }
  };

  const releaseAll = () => {
    if (heldScratchKeys.size) {
      heldScratchKeys.clear();
      emit({ type: "scratch", direction: "stop" });
    }
    spaceHeld = false;
    if (faderState !== "closed") {
      setFaderState("closed");
      emit({ type: "fader", state: "closed" });
    }
  };

  const onFocusIn = (event) => {
    if (event.target !== target.body) releaseAll();
  };
  const onVisibilityChange = () => {
    if (target.visibilityState === "hidden") releaseAll();
  };

  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);
  target.addEventListener("focusin", onFocusIn);
  target.defaultView?.addEventListener("blur", releaseAll);
  target.addEventListener("visibilitychange", onVisibilityChange);

  return {
    get heldScratchCount() {
      return heldScratchKeys.size;
    },
    setFaderState,
    releaseAll,
  };
}
