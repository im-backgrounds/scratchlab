export function describeChallengeInputReadiness({
  midiConnected,
  midiMapping,
  practiceModeEnabled,
}) {
  const midiForwardMapped = Boolean(midiMapping.forward);
  const midiBackwardMapped = Boolean(midiMapping.backward);
  const midiFaderMapped = Boolean(midiMapping.fader);
  const midiScratchReady = midiConnected &&
    midiForwardMapped && midiBackwardMapped;
  const midiFaderReady = midiConnected && midiFaderMapped;
  const scratchReady = midiScratchReady || practiceModeEnabled;
  const faderReady = midiFaderReady || practiceModeEnabled;

  return {
    canStart: scratchReady && faderReady,
    midiConnected,
    midiForwardMapped,
    midiBackwardMapped,
    midiFaderMapped,
    midiScratchReady,
    midiFaderReady,
    practiceModeEnabled,
    missing: [
      ...(!scratchReady ? ["スクラッチ入力"] : []),
      ...(!faderReady ? ["フェーダー入力"] : []),
    ],
  };
}
