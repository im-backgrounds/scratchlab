# Overview

Play scratch audio in response to the learner's input so they can hear their own
performance. Keep the score/demo source (SAMPLE) separate from the
user-triggered source (YOU).

See [architecture decisions](../architecture-decisions.md) and the
[roadmap](../roadmap.md).

# User Story

As a learner, I want to hear the sound produced by each input and control it
independently from the demo, so that I can check my performance by ear.

# Functional Requirements

- Play distinct, direction-sensitive monitoring sounds on Forward and Backward
  input, separate from the SAMPLE scratch audio.
- Output YOU audio only while the fader is open; close/mute it immediately when
  the fader closes.
- Accept MIDI and the mouse/keyboard practice controls from
  [keyboard input](keyboard-input.md) through the common semantic event model.
- Keep SAMPLE (score/demo playback) and YOU (live input monitoring) as
  independent audio sources with separate volume controls.
- Provide a mute control for YOU; SAMPLE remains controlled by its volume only.
- Apply fader gating to YOU output; it must not accidentally gate SAMPLE.
- Ensure the feature works during BPM Challenge and does not add or alter
  challenge scoring events.
- Start audio only in an allowed browser audio context in response to a practice
  input gesture; do not require a separate audio-enable button.
- Prevent stale or overlapping input voices from continuing after fader close,
  input release/stop, or leaving the practice view.

# UI Requirements

- Show distinct SAMPLE and input-audio labels.
- Provide a volume control for each source and a mute control for input audio.
- Indicate mute state and current source status visibly and accessibly.
- Keep the controls understandable while a challenge is running.
- Do not use a single unlabeled volume control for both sources.

# Data Model

Audio controls are presentation/audio state, not performance events. Keep
normalized input events separate from audio playback. Suggested settings:

```json
{
  "sampleVolume": 1,
  "youVolume": 1,
  "youMuted": false
}
```

Values are normalized to the supported range; the range and default output
levels should follow the existing audio controls. Persist settings locally if
needed. Do not persist live fader state, active voices, or audio context state.

# Acceptance Criteria

- Forward and Backward input trigger distinct, direction-sensitive YOU
  monitoring sounds.
- YOU is audible only while the fader is open and stops promptly when closed.
- SAMPLE and YOU volume controls affect only their own source, and YOU mute does
  not affect SAMPLE.
- MIDI and mouse/keyboard input produce equivalent monitoring behavior.
- Monitoring can run during BPM Challenge without changing the recorded score
  comparison or challenge result.
- Leaving the practice context does not leave YOU audio sounding.

# Future Extensions

- Optional stereo separation with SAMPLE on the left channel and YOU on the
  right channel.
- Additional monitoring latency controls and audio-device selection.
- Per-source level meters.
