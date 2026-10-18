# Overview

Allow users to practice without MIDI hardware. Keyboard controls must be
translated into the same semantic input events used by MIDI so recording,
comparison, overlays, and BPM Challenge can share behavior.

See [architecture decisions](../architecture-decisions.md) and the
[roadmap](../roadmap.md).

# User Story

As a learner without a DJ controller, I want to perform the basic scratch and
fader actions from my keyboard, so that I can use the practice experience and
its feedback.

# Functional Requirements

- Default key map:
  - Left Arrow: Forward
  - Right Arrow: Backward
  - Space: Fader
- Emit `scratch/forward` and `scratch/backward` semantic events for the two
  scratch keys.
- Space toggles the fader state between open and closed and emits a fader
  state-change event.
- Translate keyboard actions into the existing common event model before
  recording or analysis; do not add keyboard-specific score rules.
- Ignore key-repeat events so holding a key does not generate an unbounded
  stream of repeated strokes or toggles.
- Release/blur handling must not leave a held input or fader state stuck.
- Do not intercept keys while the user is typing in an editable field or when
  an unrelated browser shortcut should take precedence.
- Allow simultaneous use with connected MIDI; each received input contributes
  events to the same stream. Avoid duplicate transitions when both devices
  report an unchanged state.
- Support BPM Challenge recording using the same events, subject to the
  challenge's completion and input requirements.

# UI Requirements

- Show the active key map near the practice controls and provide concise usage
  instructions.
- Provide a visible indication of the current fader state.
- Clearly communicate when keyboard input is active and how to avoid typing
  field conflicts.
- Any future remapping UI must show conflicts and restore the documented
  defaults.

# Data Model

Keyboard input does not require its own performance event format. It produces
the common events:

```text
{ type: "scratch", direction: "forward" | "backward" | "stop", t: milliseconds }
{ type: "fader", state: "open" | "closed", t: milliseconds }
```

The default key map may be represented as configuration, but the event
recording must remain device-independent. Persist user remapping only if that
feature is introduced; defaults are Left Arrow, Right Arrow, and Space.

# Acceptance Criteria

- The three default keys perform the documented actions.
- Repeated `keydown` events from a held key do not create repeated actions.
- A key release, lost focus, or input-context switch cannot leave a control
  active indefinitely.
- Typing in text controls remains possible.
- Keyboard and MIDI events can be recorded and compared through the same
  downstream path.
- BPM Challenge can be completed without MIDI when keyboard mode is available.

# Future Extensions

- Remappable controls and alternative layouts.
- Touch and game-controller input adapters using the same event model.
- Input-device preference and accessibility options.
