# Overview

Specify timing feedback that measures how far performed events are from their
expected positions in the score. Event Model v2 implements timing metrics using
the shared matching results. BPM Challenge pass/fail still uses event-sequence
accuracy and the existing validity conditions, not timing accuracy.

See [BPM Challenge](bpm-challenge.md),
[controller overlay](controller-overlay.md),
[Event Model v2](../event-model-v2.md), and the
[GitHub work backlog](https://github.com/im-backgrounds/scratchlab/issues).

The remaining sections retain the original design proposal, including draft
field names and future UI ideas. They are not a new work commitment or a
replacement for the implemented v2 matching, timing formula, and output contract
in [Event Model v2](../event-model-v2.md). Resolve any difference against that
contract before implementation.

# User Story

As a learner, I want to know whether my actions are early or late and by how
much, so that I can improve timing rather than only event order.

# Functional Requirements

- Analyze expected versus performed event timing at the challenge BPM and score
  position.
- Report:
  - Average Error
  - Max Error
  - Accuracy
- Preserve event kind and compare scratch and fader lanes consistently with
  existing sequence analysis.
- Define how extra, missing, and ambiguous repeated events are treated before
  implementation; do not invent zero error for an unmatched event.
- Identify early/late direction as signed error and report magnitudes in
  milliseconds.
- Keep this timing result distinct from the existing event-sequence accuracy
  shown by BPM Challenge.
- Make the error tolerance used for timing accuracy explicit and consistent
  across charts and display.

# UI Requirements

- Display average and maximum absolute error in milliseconds.
- Show whether the learner tends to be early or late when the analysis supports
  that summary.
- Define and display the timing accuracy denominator and tolerance.
- Make unavailable timing results distinguishable from a zero-error result.
- Allow event-level timing feedback to be used by the
  [controller overlay](controller-overlay.md) and ghost comparison.

# Data Model

Analysis input requires expected event positions and performed event timestamps,
expressed in a shared monotonic time basis for the attempt. The logical result
should include:

```text
averageErrorMs: number | null
maxErrorMs: number | null
accuracy: number | null
matchedCount: integer
missingCount: integer
extraCount: integer
```

Average Error should be the mean absolute error of matched event pairs; Max
Error should be the maximum absolute error of matched pairs. Exact matching and
the formula for `accuracy` remain a pre-implementation decision: define
alignment, allowed timing tolerance, treatment of unmatched events, and rounding
together. Do not reuse or rename the current sequence-match accuracy.

# Acceptance Criteria

- A performed event can be paired with an expected event and yields signed
  timing error in milliseconds.
- Average Error and Max Error are derived only from defined matched events.
- Timing Accuracy has a documented tolerance, denominator, missing/extra policy,
  and rounding rule before being displayed.
- No matched events produces an unavailable result rather than false zero error.
- Timing results do not change existing BPM Challenge clears unless that product
  behavior is explicitly redesigned and separately documented.

# Future Extensions

- Visual early/late markers on the [controller overlay](controller-overlay.md).
- Ghost comparison and playback of timing deviations.
- Per-pattern timing trends in [practice history](practice-history.md).
