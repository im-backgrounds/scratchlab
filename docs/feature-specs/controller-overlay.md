# Overview

Display expected score events and the learner's performed input on or alongside
the score. This makes it possible to compare what the chart requests with what
the user actually played.

See [architecture decisions](../architecture-decisions.md), the
[BPM Challenge specification](bpm-challenge.md), and the
[roadmap](../roadmap.md).

# User Story

As a learner, I want to see my input in the context of the score, so that I can
identify what I played correctly and where I made an error.

# Functional Requirements

- Display these event kinds:
  - Forward
  - Backward
  - Fader Open
  - Fader Close
  - Stop
- Render SAMPLE (expected score/demo events) and YOU (recorded user events) as
  distinct sources.
- Use blue for SAMPLE, green for YOU, and red for an identified error.
- Preserve event kind, source, and event order in the rendering.
- Use the common semantic event model for MIDI and keyboard input.
- Show live or recorded input in synchronization with the score/playback
  position where timing data is available.
- Retain the distinction between input display and evaluation: the existing BPM
  Challenge event-sequence analysis ignores timing. See
  [BPM Challenge](bpm-challenge.md) and [timing analysis](timing-analysis.md).
- If there is insufficient information to classify an event as an error, do not
  present it as a confirmed error.
- Keep existing score notation readable and provide non-color cues such as
  labels, shapes, or patterns.

# UI Requirements

- Place the overlay in the score context without covering score symbols or
  essential controls.
- Make SAMPLE, YOU, and Error identifiable by text/legend and not color alone.
- Keep the user event history readable during and after a challenge.
- Provide an understandable empty state before input has been recorded.
- Support narrow layouts without making the score unusable.

# Data Model

Render from expected events and recorded performance events as separate input
collections. A user performance event follows the current event shape:

```text
{ type: "scratch", direction: "forward" | "backward" | "stop", t: milliseconds }
{ type: "fader", state: "open" | "closed", t: milliseconds }
```

The overlay may derive its visual position from event timestamps and score
timing, but should not mutate or duplicate the stored event record. Error
classification belongs to the analysis result, not an inferred color-only
comparison in the renderer.

# Acceptance Criteria

- All five event kinds are represented.
- Expected events render blue, performed events render green, and confirmed
  mismatches render red.
- A legend or equivalent text explains every source/color.
- Input remains visibly distinct from the expected score and stays aligned with
  the score/playback context.
- The display works with both keyboard and MIDI event sources.

# Future Extensions

- Show timing offset and error magnitude when
  [timing analysis](timing-analysis.md) is available.
- Ghost comparison between a saved take and the current performance.
- Selectable display density and overlay visibility.
