export const MIDI_INPUT_PREFERENCE_KEY = "scratchlab.midi-input.v1";
export const ALL_MIDI_INPUTS = "all";

export function createMidiInputManager({
  requestAccess,
  storage = null,
  onMidiMessage = () => {},
  onChange = () => {},
}) {
  let access = null;
  let selectedInputId = readPreference(storage);

  function getInputs() {
    return [...(access?.inputs?.values() ?? [])].map((input) => ({
      id: input.id,
      name: input.name || input.manufacturer || "MIDI Input",
      manufacturer: input.manufacturer || "",
      state: input.state === "disconnected" ? "disconnected" : "connected",
    }));
  }

  function isConnected() {
    return getInputs().some((input) =>
      input.state === "connected" &&
      (selectedInputId === ALL_MIDI_INPUTS || input.id === selectedInputId)
    );
  }

  function attachInputs() {
    for (const input of access?.inputs?.values() ?? []) {
      input.onmidimessage = selectedInputId === ALL_MIDI_INPUTS ||
          input.id === selectedInputId
        ? (event) => onMidiMessage(event.data, input)
        : null;
    }
  }

  function snapshot() {
    return {
      inputs: getInputs(),
      selectedInputId,
      connected: isConnected(),
    };
  }

  function notifyChange() {
    attachInputs();
    onChange(snapshot());
  }

  async function connect() {
    access = await requestAccess();
    access.onstatechange = notifyChange;
    notifyChange();
    return snapshot();
  }

  function selectInput(inputId) {
    if (
      inputId !== ALL_MIDI_INPUTS &&
      !getInputs().some((input) =>
        input.id === inputId && input.state === "connected"
      )
    ) {
      throw new Error("選択したMIDI入力デバイスは接続されていません。");
    }
    selectedInputId = inputId;
    const preferenceSaved = writePreference(storage, inputId);
    notifyChange();
    return { ...snapshot(), preferenceSaved };
  }

  return {
    connect,
    selectInput,
    snapshot,
    get access() {
      return access;
    },
  };
}

function readPreference(storage) {
  try {
    return storage?.getItem(MIDI_INPUT_PREFERENCE_KEY) || ALL_MIDI_INPUTS;
  } catch {
    return ALL_MIDI_INPUTS;
  }
}

function writePreference(storage, inputId) {
  try {
    if (!storage) return false;
    storage.setItem(MIDI_INPUT_PREFERENCE_KEY, inputId);
    return true;
  } catch {
    return false;
  }
}
