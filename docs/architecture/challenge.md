# Challenge Flow Analysis

## Confirmed current behavior

- [`src/domain/bpm-challenge.js`](../../src/domain/bpm-challenge.js) contains
  Challenge rules, progress derivation/evaluation, validation, and a
  LocalStorage-backed progress repository. The next BPM is derived from saved
  highest-cleared progress and is not stored independently.
- [`src/domain/challenge-session.js`](../../src/domain/challenge-session.js)
  provides a pure state machine. It describes an unscored warm-up lap followed
  by two recorded laps, analysis, and completion; transitions return effects
  for the caller rather than performing them.
- [`src/app.js`](../../src/app.js) owns the active chart/run context, playback
  boundaries, recording, cancellation, analysis, result handling, and calls to
  repositories. It applies the session machine's requested effects.
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

## Proposed future design (not current behavior)

A future extraction could make the Challenge workflow's effect boundary
explicit, separating transition decisions from playback, recording, and
repository calls. The existing pure session machine is a candidate seam; no
replacement orchestrator or API is specified here.

## Compatibility constraints

- Preserve progress key/version and chart identity, BPM derivation, attempt
  eligibility, duration limits, and accuracy thresholds.
- Preserve the lap sequence: lap 1 is playback-only; laps 2 and 3 are recorded
  and analyzed independently.
- Preserve cancellation and loop-boundary semantics, including preventing
  stale/late events from advancing a finished attempt.
- Keep Challenge analysis on the shared Event Model v2 path; do not introduce
  chart-specific or device-specific scoring.
