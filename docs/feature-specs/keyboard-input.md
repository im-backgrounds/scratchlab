# Overview

Allow users to practice without MIDI hardware. Mouse and keyboard controls must
be translated into the same semantic input events used by MIDI so recording,
comparison, overlays, and BPM Challenge can share behavior.

See [architecture decisions](../architecture-decisions.md) and the
[GitHub work backlog](https://github.com/im-backgrounds/scratchlab/issues).

# User Story

As a learner without a DJ controller, I want to perform scratch actions with
mouse movement and fader actions with keyboard keys, so that I can practice
without other inputs interfering.

# Functional Requirements

- A fixed practice-mode button enables mouse and keyboard practice; Escape
  disables it.
- Upward mouse movement performs Forward; downward movement performs Backward.
- W/P opens the fader; S/L closes it.
- While multiple fader keys are held, the most recently pressed key determines
  the fader state. Releasing it restores the state of the most recently pressed
  key that remains held; no held key means closed.
- Show which fader keys are currently held.
- While practice mode is active, ignore other mouse and keyboard actions.
- Translate keyboard actions into the existing common event model before
  recording or analysis; do not add keyboard-specific score rules.
- Ignore key-repeat events so holding a fader key does not generate repeated
  transitions.
- Release/blur handling must not leave a held input or fader state stuck.
- Allow simultaneous use with connected MIDI; each received input contributes
  events to the same stream. Avoid duplicate transitions when both devices
  report an unchanged state.
- Support BPM Challenge recording using the same events, subject to the
  challenge's completion and input requirements.

# UI Requirements

- Show the mouse and fader key map near the practice controls.
- Keep the practice-mode button fixed at the lower-right of the screen.
- Provide a visible indication of the current fader state.
- Visually indicate currently held fader keys.
- Any future remapping UI must show conflicts and restore the documented
  defaults.

# Data Model

Keyboard input does not require its own performance event format. It produces
the common events:

```text
{ type: "scratch", direction: "forward" | "backward" | "stop", t: milliseconds }
{ type: "fader", state: "open" | "closed", t: milliseconds }
```

The default key map may be represented as configuration, but the event recording
must remain device-independent. Persist user remapping only if that feature is
introduced; defaults are W/P for open and S/L for closed.

# Acceptance Criteria

- Mouse movement up and down produces forward and backward scratch events.
- W/P and S/L apply last-pressed-wins fader behavior while held.
- Escape disables practice mode and releases active inputs.
- Non-practice mouse and keyboard actions are ignored while practice mode is
  active.
- A key release, lost focus, or input-context switch cannot leave a control
  active indefinitely.
- Keyboard and MIDI events can be recorded and compared through the same
  downstream path.
- BPM Challenge can be completed without MIDI when keyboard mode is available.

# Future Extensions

- Remappable controls and alternative layouts.
- Touch and game-controller input adapters using the same event model.
- Input-device preference and accessibility options.
