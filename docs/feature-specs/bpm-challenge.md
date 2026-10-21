# Overview

Document the implemented BPM Challenge behavior. This feature spec describes the
existing application and is not a request to change its implementation. The
source of truth for current behavior is the challenge domain/session code and
the practice UI; if this document drifts, inspect the implementation before
changing either. See [roadmap](../roadmap.md).

# User Story

As a learner, I want to repeat a score at progressively faster tempos and see
whether my performed events match the expected pattern, so that I can work
toward a measurable BPM goal.

# Functional Requirements

## Eligibility and challenge BPM

- The practice challenge applies to the selected built-in chart. Unsaved builder
  drafts are not eligible.
- A challenge requires both scratch and fader input. These can be provided by
  connected MIDI with Forward, Backward, and Fader mapped, or by enabling
  practice mode for Mouse scratch and Keyboard fader input. MIDI and practice
  mode may also be combined.
- The initial challenge BPM is 80.
- After clearing a BPM, the next challenge BPM is 5 BPM above the highest
  cleared BPM, capped at 180.
- A challenge is complete after clearing 180 BPM.
- Challenge BPM is derived from stored progress; current challenge BPM is not
  independently persisted.
- BPM rules: minimum 60, maximum 180, step 5, pass accuracy 90%, and maximum
  recording duration 1.2 times expected duration.

## Attempt flow

- Starting runs one unscored demo loop, followed by two recorded loops, then
  analysis and a result.
- Recording starts and stops automatically at loop boundaries.
- The BPM control is fixed during a challenge.
- Stopping playback, changing the chart, or leaving the practice context cancels
  the active attempt and discards its incomplete recording.
- The recorded loops are compared independently against the expected score and
  their tallies are added; events from one loop cannot match another loop.
- Expected and performed events are aligned by sequence. Scratch
  (Forward/Backward/Stop) and fader (Open/Close) lanes are compared separately,
  so cross-lane ordering does not affect matching.
- Timing is not evaluated. Accuracy is
  `matched / (matched + missing + extra) * 100`, rounded to one decimal place.
  An empty comparison has no accuracy.
- A valid attempt clears at 90% or higher and counts as an attempt. A
  below-threshold valid attempt is retained as a failed attempt at the same BPM.
  A take longer than 1.2 times the expected duration is invalid, counts as a
  failed attempt, and does not update best accuracy or cleared BPM.
- Attempts with no accuracy, no recording, invalid expected duration, or a BPM
  that is not the current challenge BPM are ignored and not counted.
- Successful and failed attempts both return to the same start action; a
  successful attempt starts the derived next BPM, and a failure retries the same
  BPM.
- A progress reset removes the selected chart's challenge progress.

## Progress retention

- Save progress locally per built-in chart.
- Retain highest cleared BPM, attempt count, clear count, best valid accuracy,
  and last attempt.
- Saved progress is versioned and normalized. Current format version is 1,
  storage key is `scratchlab.challenge`, and at most 200 chart entries are kept.
- A future-version store is not overwritten. Invalid stored fields are
  normalized or dropped; the next BPM is always re-derived from cleared
  progress.

# UI Requirements

- Show current challenge BPM, highest cleared BPM, attempts, clears, best
  accuracy, and the latest result.
- Show progress through Demo, Recording 1/2, Recording 2/2, Analyzing, and
  Result.
- Disable challenge start during active work and after completion; expose
  progress reset when progress exists and no attempt is active.
- Show MIDI connection/mapping and practice-mode readiness before a challenge
  starts, with a link to MIDI setup.
- Confirm before leaving the practice context during an active challenge;
  confirming aborts the attempt and discards its incomplete recording.
- Explain input prerequisites and show status/result messages.
- Indicate whether the current attempt is a demo, recording, analysis, or
  result.
- Provide a route from MIDI setup back to Practice without changing the selected
  chart or saved challenge progress.

# Data Model

The versioned challenge store is logically:

```json
{
  "version": 1,
  "charts": {
    "builtin:chart-id": {
      "highestClearedBpm": 80,
      "attempts": 1,
      "clears": 1,
      "bestAccuracy": 95.5,
      "lastAttempt": {
        "bpm": 80,
        "accuracy": 95.5,
        "cleared": true,
        "valid": true,
        "at": "ISO-8601 timestamp"
      }
    }
  }
}
```

`highestClearedBpm` is null before a clear; `bestAccuracy` and `lastAttempt` may
also be null. The chart key uses a stable built-in chart ID. The active state
machine is transient and follows
`ready → demo → recording 1/2 →
recording 2/2 → analyzing → result`; abort
returns it to ready.

# Acceptance Criteria

- The first attempt starts at 80 BPM and later BPM is derived in +5 steps up
  to 180.
- The demo loop is not scored; exactly two subsequent loops are recorded and
  analyzed separately.
- A valid accuracy of 90% or more advances progress; a lower score retries the
  same BPM.
- Overlong attempts are invalid and cannot set a best accuracy or clear.
- Challenge eligibility, reset, cancellation, and stored progress follow the
  rules above without storing a separate current BPM.
- The displayed score is identified as event-sequence accuracy, not timing
  accuracy.

# Future Extensions

- Show performed events on the score; see
  [controller overlay](controller-overlay.md).
- Add timing metrics without changing the existing sequence-score definition;
  see [timing analysis](timing-analysis.md).
- Revisit per-chart history and longer-term trends using
  [practice history](practice-history.md).
