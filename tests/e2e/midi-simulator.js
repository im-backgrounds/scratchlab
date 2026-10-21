/**
 * Minimal Web MIDI input port. Timestamps use performance.now()'s clock;
 * messages are delivered at that time, not merely tagged with a future time.
 * This function is self-contained so it can run in a browser init script.
 */
export function createMidiSimulator({
  now = () => performance.now(),
  schedule = (callback, delay) => setTimeout(callback, delay),
} = {}) {
  const input = Object.assign(new EventTarget(), {
    id: "scratchlab-e2e-midi",
    manufacturer: "ScratchLab E2E",
    name: "Virtual MIDI Input",
    type: "input",
    state: "connected",
    connection: "open",
  });
  let handler = null;
  Object.defineProperty(input, "onmidimessage", {
    get: () => handler,
    set(next) {
      if (handler) input.removeEventListener("midimessage", handler);
      handler = next;
      if (handler) input.addEventListener("midimessage", handler);
    },
  });
  const access = Object.assign(new EventTarget(), {
    inputs: new Map([[input.id, input]]),
    outputs: new Map(),
    sysexEnabled: false,
  });

  function validate({ timestamp, data }) {
    if (!Number.isFinite(timestamp) || timestamp < now()) {
      throw new RangeError("MIDI timestamp must be finite and not in the past");
    }
    if (
      !data || data.length !== 3 ||
      !Number.isInteger(data[0]) || data[0] < 0x80 || data[0] > 0xef ||
      ![data[1], data[2]].every((byte) =>
        Number.isInteger(byte) && byte >= 0 && byte <= 127
      )
    ) {
      throw new TypeError("Expected a three-byte channel MIDI message");
    }
    return { timestamp, data: Uint8Array.from(data) };
  }

  function dispatch(message) {
    const event = new Event("midimessage");
    Object.defineProperties(event, {
      data: { value: message.data },
      timeStamp: { value: message.timestamp },
      receivedTime: { value: message.timestamp },
    });
    input.dispatchEvent(event);
  }

  function enqueue(message) {
    const delay = message.timestamp - now();
    if (delay <= 0) dispatch(message);
    else schedule(() => dispatch(message), delay);
  }

  return {
    access,
    requestMIDIAccess() {
      return Promise.resolve(access);
    },
    send(message) {
      enqueue(validate(message));
    },
    sendMany(messages) {
      const validated = messages.map(validate);
      for (let index = 1; index < validated.length; index += 1) {
        if (validated[index].timestamp < validated[index - 1].timestamp) {
          throw new RangeError("MIDI messages must be in timestamp order");
        }
      }
      validated.forEach(enqueue);
    },
  };
}
