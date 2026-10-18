function initializeAudio(state, setAudioResources) {
  let audioContext = state.audioContext;
  let scratchBuffers = state.scratchBuffers;
  if (!audioContext) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (AudioCtor) {
      audioContext = new AudioCtor();
    }
  }

  if (audioContext && !scratchBuffers) {
    scratchBuffers = createScratchBuffers(audioContext);
  }

  if (
    audioContext !== state.audioContext ||
    scratchBuffers !== state.scratchBuffers
  ) {
    setAudioResources({ audioContext, scratchBuffers });
  }

  if (audioContext && audioContext.state === "suspended") {
    audioContext.resume();
  }
}

function createScratchBuffers(audioContext) {
  const sampleRate = audioContext.sampleRate;
  const duration = 2;
  const frameCount = Math.floor(sampleRate * duration);
  const phraseBuffer = audioContext.createBuffer(1, frameCount, sampleRate);
  const phrase = phraseBuffer.getChannelData(0);
  let phase = 0;

  for (let index = 0; index < frameCount; index += 1) {
    const time = index / sampleRate;
    const fundamental = 118;
    phase += (2 * Math.PI * fundamental) / sampleRate;
    let voice = 0;

    for (let harmonic = 1; harmonic <= 18; harmonic += 1) {
      const frequency = fundamental * harmonic;
      const formant = Math.exp(-Math.pow((frequency - 720) / 340, 2)) +
        0.65 * Math.exp(-Math.pow((frequency - 1450) / 520, 2));
      voice += Math.sin(phase * harmonic) * formant / harmonic;
    }

    const crackle = Math.random() < 0.0009 ? (Math.random() - 0.5) * 0.55 : 0;
    const hiss = (Math.random() - 0.5) * 0.012;
    phrase[index] = Math.tanh((voice * 0.34) + crackle + hiss) * 0.72;
  }

  const reverseBuffer = audioContext.createBuffer(1, frameCount, sampleRate);
  const reversed = reverseBuffer.getChannelData(0);
  for (let index = 0; index < frameCount; index += 1) {
    reversed[index] = phrase[frameCount - index - 1];
  }

  const noiseBuffer = audioContext.createBuffer(
    1,
    Math.floor(sampleRate * 0.5),
    sampleRate,
  );
  const noise = noiseBuffer.getChannelData(0);
  for (let index = 0; index < noise.length; index += 1) {
    noise[index] = (Math.random() * 2 - 1) * 0.6;
  }

  return { forward: phraseBuffer, reverse: reverseBuffer, noise: noiseBuffer };
}

function playClickSound(state, output, isDownbeat = false) {
  if (!state.audioContext || !state.clickEnabled) {
    return;
  }

  const oscillator = state.audioContext.createOscillator();
  const gainNode = state.audioContext.createGain();
  const now = state.audioContext.currentTime;

  oscillator.type = "triangle";
  oscillator.frequency.value = isDownbeat ? 1250 : 1100;

  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.exponentialRampToValueAtTime(
    state.clickVolume * (isDownbeat ? 0.29 : 0.24),
    now + 0.01,
  );
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

  oscillator.connect(gainNode);
  gainNode.connect(output);

  oscillator.start(now);
  oscillator.stop(now + 0.09);
}

function trackScratchGain(source, gain, activeScratchGains) {
  activeScratchGains.add(gain);
  source.addEventListener("ended", () => activeScratchGains.delete(gain), {
    once: true,
  });
}

function silenceActiveScratch(state, activeScratchGains) {
  if (!state.audioContext) return;
  const now = state.audioContext.currentTime;
  activeScratchGains.forEach((gain) => {
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(0, now);
  });
}

function getScratchDirection(state, steps, stepIndex) {
  if (state.isBuilderPlayback && state.builderDirections[stepIndex]) {
    return state.builderDirections[stepIndex] === "F" ? -1 : 1;
  }
  for (let index = stepIndex; index >= 0; index -= 1) {
    if (steps[index] === "L") return -1;
    if (steps[index] === "R") return 1;
  }
  return -1;
}

function scheduleFaderCuts(gain, now, duration, cutCount, peakGain) {
  const segmentCount = cutCount + 1;
  const gap = Math.min(0.012, duration * 0.12);
  const segmentDuration = (duration - gap * cutCount) / segmentCount;
  const envelope = Math.max(0.0001, peakGain);

  for (let segment = 0; segment < segmentCount; segment += 1) {
    const start = now + segment * (segmentDuration + gap);
    const end = start + segmentDuration;
    const edge = Math.min(0.005, segmentDuration * 0.18);
    gain.setValueAtTime(0.0001, start);
    gain.linearRampToValueAtTime(envelope, start + edge);
    gain.setValueAtTime(envelope, end - edge);
    gain.linearRampToValueAtTime(0.0001, end);
  }
}

function scheduleChop(gain, now, duration, peakGain) {
  const pulseDuration = duration / 2;
  const edge = Math.min(0.005, pulseDuration * 0.18);
  const envelope = Math.max(0.0001, peakGain);
  gain.setValueAtTime(0.0001, now);
  gain.linearRampToValueAtTime(envelope, now + edge);
  gain.setValueAtTime(envelope, now + pulseDuration - edge);
  gain.linearRampToValueAtTime(0.0001, now + pulseDuration);
}

function scheduleFlare(gain, now, duration, peakGain) {
  const soundStart = now + Math.min(0.012, duration * 0.12);
  const attackEdge = Math.min(0.005, (duration - (soundStart - now)) * 0.18);
  const envelope = Math.max(0.0001, peakGain);
  const fadeStart = Math.max(soundStart + attackEdge, now + duration * 0.78);

  gain.setValueAtTime(0.0001, now);
  gain.setValueAtTime(0.0001, soundStart);
  gain.linearRampToValueAtTime(envelope, soundStart + attackEdge);
  gain.setValueAtTime(envelope, fadeStart);
  gain.linearRampToValueAtTime(0.0001, now + duration);
}

function playScratch(
  state,
  getPlaybackChart,
  activeScratchGains,
  output,
  type,
  stepIndex,
  strokeRunLength = 1,
  options = {},
) {
  if (
    !state.audioContext || !state.scratchBuffers || type === "-" || type === "M"
  ) {
    return;
  }

  const audioContext = state.audioContext;
  const direction = options.direction ??
    getScratchDirection(state, getPlaybackChart().steps, stepIndex);
  const playbackChart = getPlaybackChart();
  const slotDuration = options.durationSeconds
    ? options.durationSeconds
    : playbackChart.scoreGrid
    ? (60 / state.bpm) * playbackChart.scoreGrid.beatsPerBar /
      playbackChart.scoreGrid.ticksPerBar
    : Math.max(0.12, (60000 / state.bpm) / 2000);
  const isTransformerStroke = type === "S" && strokeRunLength > 1;
  const duration = options.durationSeconds ??
    (type === "C" || type === "F"
      ? 0.055
      : isTransformerStroke
      ? Math.min(1.6, slotDuration * strokeRunLength * 0.82)
      : type === "S"
      ? Math.min(0.18, slotDuration * 0.68)
      : Math.min(0.8, Math.max(0.12, slotDuration * strokeRunLength * 0.68)));
  const buffer = direction < 0
    ? state.scratchBuffers.forward
    : state.scratchBuffers.reverse;
  const source = audioContext.createBufferSource();
  const directionFilter = audioContext.createBiquadFilter();
  const gainNode = state.audioContext.createGain();
  const now = audioContext.currentTime;
  const outputVolume = options.volume ?? 1;
  const offset = (stepIndex * 0.11) %
    Math.max(0.01, buffer.duration - duration * 3.4);

  source.buffer = buffer;
  source.playbackRate.setValueAtTime(direction < 0 ? 1.12 : 0.82, now);
  directionFilter.type = "lowpass";
  directionFilter.Q.value = direction < 0 ? 0.7 : 1.4;
  directionFilter.frequency.setValueAtTime(direction < 0 ? 3600 : 1100, now);
  directionFilter.connect(gainNode);
  source.connect(directionFilter);
  gainNode.connect(output);
  trackScratchGain(source, gainNode.gain, activeScratchGains);

  gainNode.gain.setValueAtTime(0.0001, now);
  const cutCount = options.cutCount ??
    (type === "C" || type === "F" ? 1 : type === "S" ? 3 : 0);
  if (cutCount > 0) {
    if (type === "C") {
      scheduleChop(gainNode.gain, now, duration, outputVolume * 0.4);
    } else if (type === "F") {
      scheduleFlare(gainNode.gain, now, duration, outputVolume * 0.4);
    } else {scheduleFaderCuts(
        gainNode.gain,
        now,
        duration,
        cutCount,
        outputVolume * 0.4,
      );}
  } else {
    const strokeLevel = Math.max(0.0001, outputVolume * 0.3);
    gainNode.gain.linearRampToValueAtTime(strokeLevel, now + 0.006);
    gainNode.gain.setValueAtTime(strokeLevel, now + duration * 0.78);
    gainNode.gain.linearRampToValueAtTime(0.0001, now + duration);
  }

  source.start(now, offset);
  source.stop(now + duration);

  if (options.suppressFriction || type === "F") {
    return;
  }

  const friction = audioContext.createBufferSource();
  const filter = audioContext.createBiquadFilter();
  const frictionGain = audioContext.createGain();
  friction.buffer = state.scratchBuffers.noise;
  friction.playbackRate.value = direction < 0 ? 0.85 : 0.55;
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(direction < 0 ? 2500 : 1100, now);
  filter.Q.value = direction < 0 ? 0.8 : 1.3;
  frictionGain.gain.setValueAtTime(0.0001, now);
  if (cutCount > 0) {
    if (type === "C") {
      scheduleChop(frictionGain.gain, now, duration, outputVolume * 0.012);
    } else if (type === "F") {
      scheduleFlare(frictionGain.gain, now, duration, outputVolume * 0.012);
    } else {scheduleFaderCuts(
        frictionGain.gain,
        now,
        duration,
        cutCount,
        outputVolume * 0.012,
      );}
  } else {
    frictionGain.gain.linearRampToValueAtTime(
      Math.max(0.0001, outputVolume * 0.025),
      now + 0.008,
    );
    frictionGain.gain.linearRampToValueAtTime(0.0001, now + duration * 0.65);
  }
  friction.connect(filter);
  filter.connect(frictionGain);
  frictionGain.connect(output);
  trackScratchGain(friction, frictionGain.gain, activeScratchGains);
  friction.start(now, Math.random() * 0.2);
  friction.stop(now + duration);
}

export function createScratchAudio(state, getPlaybackChart, setAudioResources) {
  const activeSampleGains = new Set();
  const monitor = {
    sampleVolume: state.volume,
    youVolume: 0.8,
    youMuted: false,
    faderOpen: false,
  };
  let outputContext = null;
  let sampleOutput = null;
  let youOutput = null;
  let inputVoice = null;

  const updateOutputs = () => {
    if (!state.audioContext) return;
    if (outputContext !== state.audioContext) {
      outputContext = state.audioContext;
      sampleOutput = outputContext.createGain();
      sampleOutput.connect(outputContext.destination);
      youOutput = outputContext.createGain();
      youOutput.connect(outputContext.destination);
    }
    const now = outputContext.currentTime;
    sampleOutput.gain.setTargetAtTime(
      monitor.sampleVolume,
      now,
      0.01,
    );
    youOutput.gain.setTargetAtTime(
      monitor.youMuted || !monitor.faderOpen ? 0 : monitor.youVolume,
      now,
      0.01,
    );
  };

  const silenceInput = () => {
    if (!inputVoice || !state.audioContext) return;
    const { source, gain, filter } = inputVoice;
    inputVoice = null;
    const now = state.audioContext.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(0, now, 0.005);
    source.stop(now + 0.025);
    source.addEventListener("ended", () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    }, { once: true });
  };

  return {
    initializeAudio: () => {
      initializeAudio(state, setAudioResources);
      updateOutputs();
    },
    playClickSound: (isDownbeat) => {
      updateOutputs();
      playClickSound(state, sampleOutput, isDownbeat);
    },
    playScratch: (type, stepIndex, strokeRunLength, options) =>
      playScratch(
        state,
        getPlaybackChart,
        activeSampleGains,
        sampleOutput,
        type,
        stepIndex,
        strokeRunLength,
        options,
      ),
    silenceActiveScratch: () => silenceActiveScratch(state, activeSampleGains),
    playInputScratch: (direction) => {
      updateOutputs();
      if (!monitor.faderOpen || monitor.youMuted || !state.audioContext) return;
      const audioContext = state.audioContext;
      const now = audioContext.currentTime;
      const isForward = direction === "forward";
      if (inputVoice) {
        inputVoice.filter.frequency.setTargetAtTime(
          isForward ? 1500 : 2400,
          now,
          0.025,
        );
        return;
      }
      const source = audioContext.createBufferSource();
      const filter = audioContext.createBiquadFilter();
      const gain = audioContext.createGain();
      source.buffer = state.scratchBuffers.noise;
      source.loop = true;
      filter.type = "bandpass";
      filter.Q.setValueAtTime(0.8, now);
      filter.frequency.setValueAtTime(isForward ? 1500 : 2400, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.16, now + 0.015);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(youOutput);
      source.start(now, Math.random() * 0.2);
      inputVoice = { source, filter, gain };
    },
    setInputFaderState: (isOpen) => {
      monitor.faderOpen = isOpen;
      updateOutputs();
      if (!isOpen) silenceInput();
    },
    silenceInput,
    setMonitorSettings: (settings) => {
      Object.assign(monitor, settings);
      updateOutputs();
      if (monitor.youMuted) silenceInput();
    },
  };
}
