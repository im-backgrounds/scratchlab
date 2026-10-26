# Refactoring Architecture Baseline

This is an evidence-based description of the current implementation, not a
target architecture or an authorization to change application behavior. It is
the starting point for refactoring discussions; verify the linked source before
making extraction decisions.

## Analyses

- [App.js responsibility inventory](app-js-analysis.md)
- [App startup and composition](app-startup.md)
- [State and actions](state.md)
- [Challenge flow](challenge.md)
- [Event Model v2](event-model-v2.md)
- [Storage and persistence](storage.md)

The [README architecture overview](../../README.md) provides the high-level
module map. The [Event Model v2 specification](../event-model-v2.md) and
[architecture decisions](../architecture-decisions.md) remain the sources for
their respective behavior and technical constraints.

## Confirmed current boundaries

- `index.html` loads `src/app.js` as a browser-native ES module. The app module
  compiles the chart catalog, constructs shared state and repositories, wires
  domain/features/UI/services, registers handlers, and renders the initial UI.
- `src/state/` provides a small in-memory store and action facade. It does not
  own the application workflows; `src/application/playback-controller.js`
  coordinates playback lifecycle and ticks, while `src/app.js` composes it and
  coordinates Challenge effects, inputs, persistence, and view transitions.
- Challenge rules and session transitions have domain modules, but the app
  performs their side effects and joins session state to analysis, repositories,
  and UI.
- Event Model v2 uses one expected timeline, matching result, timing analysis,
  and overlay projection. The model identifier is not a persisted-data version.
- MIDI devices are accessed through the MIDI input manager. MIDI, keyboard, and
  mouse actions converge on the app's common input handling and recording path.
- Persistence is split among feature-specific LocalStorage repositories.
  `storage-utils.js` only wraps low-level Storage calls; repositories retain
  their own schemas, validation, migration, and failure handling.

These are descriptions of code, not claims that every chart, browser, device, or
future feature has been fully validated. In particular, the Event Model
specification and GitHub Issues track remaining verification separately from the
completed model foundation.

## Compatibility constraints before extraction

Treat the following as hard constraints unless a separately reviewed change
explicitly revises them:

1. Keep the app deployable as static HTML and native ES modules; do not add a
   server, build step, framework, or dependency as an incidental consequence of
   module extraction.
2. Preserve existing user-visible workflows and the input event vocabulary and
   ordering. Mouse, keyboard, and MIDI must continue through the shared
   semantic-input and recording path.
3. Preserve LocalStorage keys, stored shapes, version meanings, and existing
   user data. Keep repository-specific validation, future-version protection,
   and existing migrations intact. Do not silently reset, rewrite, or migrate
   data.
4. Keep Event Model v2 distinct from storage versioning. Do not re-score legacy
   records lacking v2 runtime context, add a v1 compatibility scorer to the
   runtime, or persist transient boundary/matching context without an explicitly
   reviewed data-contract change.
5. Preserve Challenge progress identity and derivation: current BPM is derived
   from the highest cleared BPM, and the active attempt is transient. Preserve
   the warm-up and two recorded-loop boundaries.
6. Preserve public/tested module APIs and legacy test dependencies until their
   callers and regression coverage have been reviewed; see
   [Testing and Legacy APIs](../testing-and-legacy-apis.md).
7. Preserve failure behavior when browser storage or Web MIDI is unavailable,
   including the existing user-facing status paths.

## Proposed direction (not current behavior or an approved design)

The analyses identify existing seams that may support later extraction. A future
design could move composition and workflow coordination behind explicit
interfaces while keeping domain rules independent of DOM rendering. Any such
proposal should first define ownership of side effects, state transitions,
storage contracts, and input ordering, then validate those contracts with
focused regression tests. No extraction, migration, or interface change is
specified by this baseline.

## Maintaining this baseline

Update the relevant analysis when implementation boundaries or compatibility
contracts change. Keep observed behavior under **Confirmed current behavior**
and label unimplemented recommendations as **Proposed future design**. Verify
source links and applicable tests rather than treating this document as a
substitute for implementation evidence.
