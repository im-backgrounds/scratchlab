# Challenge Flow Analysis

## Confirmed current behavior

- [`src/domain/bpm-challenge.js`](../../src/domain/bpm-challenge.js) contains
  Challenge rules, progress derivation/evaluation, validation, and a
  LocalStorage-backed progress repository. The next BPM is derived from saved
  highest-cleared progress and is not stored independently.
- [`src/domain/challenge-session.js`](../../src/domain/challenge-session.js)
  provides a pure state machine. It describes an unscored warm-up lap followed
  by two recorded laps, analysis, and completion; transitions return effects for
  the caller rather than performing them.
- [`src/application/playback-controller.js`](../../src/application/playback-controller.js)
  coordinates playback ticks and invokes the Challenge loop-boundary hook.
  [`src/application/challenge-controller.js`](../../src/application/challenge-controller.js)
  owns the active attempt, applies pure session transitions, and coordinates
  playback, recording boundaries, delayed analysis, completion, and abort
  cleanup through injected ports. [`src/app.js`](../../src/app.js) composes the
  controller and retains separate BPM Challenge and Beginner Course result
  policies.
- [`src/features/bpm-challenge-view.js`](../../src/features/bpm-challenge-view.js)
  builds the Challenge panel view from progress and session descriptions;
  [`src/ui/challenge.js`](../../src/ui/challenge.js) binds and renders the DOM.
- The runtime Challenge uses the shared performance-analysis path. Its sequence
  accuracy and duration eligibility are distinct from timing analysis.

Evidence: [`src/domain/bpm-challenge.js`](../../src/domain/bpm-challenge.js),
[`src/domain/challenge-session.js`](../../src/domain/challenge-session.js),
[`src/app.js`](../../src/app.js),
[`src/features/bpm-challenge-view.js`](../../src/features/bpm-challenge-view.js),
[`docs/feature-specs/bpm-challenge.md`](../feature-specs/bpm-challenge.md).

## Application orchestration

The Challenge controller injects playback, recording/performance analysis,
repositories, transport, and status/rendering ports. Warm-up lap 1 remains
playback-only; recording starts at lap 2, opens a separate loop at lap 3, and
finishes before the delayed analysis callback. Abort returns the session to idle
and makes any pending analysis callback inert. BPM Challenge and Beginner Course
continue to use their existing, distinct outcome policies.

## Compatibility constraints

- Preserve progress key/version and chart identity, BPM derivation, attempt
  eligibility, duration limits, and accuracy thresholds.
- Preserve the lap sequence: lap 1 is playback-only; laps 2 and 3 are recorded
  and analyzed independently.
- Preserve cancellation and loop-boundary semantics, including preventing
  stale/late events from advancing a finished attempt.
- Keep Challenge analysis on the shared Event Model v2 path; do not introduce
  chart-specific or device-specific scoring.
