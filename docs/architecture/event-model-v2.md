# Event Model v2 Architecture Analysis

## Confirmed current behavior

- [`src/domain/performance-analysis.js`](../../src/domain/performance-analysis.js)
  declares `EVENT_MODEL_VERSION = 2`, builds the expected meaning-event
  timeline, matches recorded events, and analyzes timing from common matching
  results.
- The expected timeline represents direction changes as Forward/Backward strokes
  and fader state changes as Fader Open/Close. Continued movement in the same
  direction does not create another stroke. Stop is an observation, not a scored
  meaning event.
- [`src/features/performance-view.js`](../../src/features/performance-view.js)
  builds one runtime analysis containing expected events, matching, timing, and
  overlay data. Runtime context is kept in a `WeakMap` keyed by the in-memory
  performance object and only returned for the corresponding chart/score.
- [`src/domain/performance-overlay.js`](../../src/domain/performance-overlay.js)
  projects the expected timeline, recorded events, matching, and timing results
  rather than applying separate scoring.
- [`src/app.js`](../../src/app.js) routes normalized input through the shared
  recording path and coordinates loop boundaries and analysis. The app retains
  transient analysis context; persisted legacy records lacking that context are
  not re-scored as v2.
- The specification states that v2 is not a saved-data version. The old scoring
  APIs have documented legacy and regression-test dependencies; runtime scoring
  uses v2. See [`docs/event-model-v2.md`](../event-model-v2.md) and
  [`docs/testing-and-legacy-apis.md`](../testing-and-legacy-apis.md).

## Proposed future design (not current behavior)

Future work could further isolate timeline creation, matching, timing, and
projection behind explicit domain contracts. Any change must preserve a single
shared analysis result across Challenge, Beginner Course, results, and overlay.
This analysis does not propose a new model, event vocabulary, storage format, or
migration.

## Compatibility constraints

- Treat model version 2 as an analysis contract, not an application or storage
  version. Preserve existing persisted performance formats and do not silently
  re-score legacy records.
- Preserve initial fader-state validation, physical loop-boundary snapshots,
  Stop exclusion from matching/timing/overlay, and recorded loop ownership.
- Preserve timing as a measure derived from matching pairs; it must not redefine
  sequence accuracy or pass/fail.
- Preserve shared semantic inputs and the common Expected → Matching → Timing →
  Overlay result. Do not create device- or chart-specific scoring paths.
- Review legacy API and regression-test dependencies before removing or
  reshaping APIs; see the linked technical reference.
