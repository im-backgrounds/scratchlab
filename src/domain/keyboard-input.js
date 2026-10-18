const FADER_KEYS = new Map([
  ["KeyW", "open"],
  ["KeyP", "open"],
  ["KeyS", "closed"],
  ["KeyL", "closed"],
]);

export function bindKeyboardInput({
  target = globalThis.document,
  enabled = () => true,
  onEvent,
  onEscape = () => {},
  onFaderStateChange = () => {},
}) {
  const heldFaderKeys = new Map();
  let faderState = "closed";

  const emit = (event) => onEvent({ ...event, time: Date.now() });
  const updateFaderState = () => {
    const nextState = [...heldFaderKeys.values()].at(-1) ?? "closed";
    const keys = [...heldFaderKeys.keys()];
    if (nextState !== faderState) {
      faderState = nextState;
      onFaderStateChange(faderState, keys);
      emit({ type: "fader", state: faderState });
    } else {
      onFaderStateChange(faderState, keys);
    }
  };

  const onKeyDown = (event) => {
    if (!enabled()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.code === "Escape") {
      if (!event.repeat) onEscape();
      return;
    }
    if (
      event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
      !FADER_KEYS.has(event.code)
    ) return;

    if (!event.repeat && !heldFaderKeys.has(event.code)) {
      heldFaderKeys.set(event.code, FADER_KEYS.get(event.code));
      updateFaderState();
    }
  };

  const onKeyUp = (event) => {
    if (!enabled() && !heldFaderKeys.has(event.code)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (heldFaderKeys.delete(event.code)) updateFaderState();
  };

  const releaseAll = () => {
    heldFaderKeys.clear();
    if (faderState !== "closed") {
      faderState = "closed";
      onFaderStateChange(faderState, []);
      emit({ type: "fader", state: faderState });
    } else {
      onFaderStateChange(faderState, []);
    }
  };

  const onVisibilityChange = () => {
    if (target.visibilityState === "hidden") releaseAll();
  };

  target.addEventListener("keydown", onKeyDown, true);
  target.addEventListener("keyup", onKeyUp, true);
  target.defaultView?.addEventListener("blur", releaseAll);
  target.addEventListener("visibilitychange", onVisibilityChange);

  return {
    setFaderState(state) {
      faderState = state;
      onFaderStateChange(faderState, [...heldFaderKeys.keys()]);
    },
    releaseAll,
  };
}
