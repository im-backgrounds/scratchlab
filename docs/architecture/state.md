# State and Actions Analysis

## Confirmed current behavior

- [`src/state/store.js`](../../src/state/store.js) creates initial application
  state and exposes a getter-only state view plus `dispatch`. Its reducer
  returns partial updates; dispatch merges them into the existing state object.
- Selected collections and builder metadata are frozen when state is created or
  updated. This is shallow protection of those collections, not a general
  immutable-state or transactional system.
- [`src/state/actions.js`](../../src/state/actions.js) is a facade over
  dispatch. It also compiles and prepares builder edits, so it is not only a
  list of primitive setters.
- [`src/app.js`](../../src/app.js) reads the shared state and coordinates
  workflows around it. The store does not own playback, MIDI, Challenge, or
  persistence side effects.
- Most state is transient. Saved chart/session data is handled by the chart
  repository; the in-memory store itself does not serialize all application
  state.

Evidence: [`src/state/store.js`](../../src/state/store.js),
[`src/state/actions.js`](../../src/state/actions.js),
[`src/app.js`](../../src/app.js),
[`src/domain/chart-storage.js`](../../src/domain/chart-storage.js).

## Proposed future design (not current behavior)

A future refactoring could clarify which state belongs to a feature workflow and
which is presentation or runtime state. It could also make action effects more
explicit. No replacement state library, immutable architecture, or
state-persistence layer is proposed or approved here.

## Compatibility constraints

- Preserve state field names and action behavior used by the app and tests until
  all consumers have been migrated deliberately.
- Preserve state initialization defaults, reset semantics, and collection
  protection.
- Do not make transient playback, recording, MIDI access, or Event Model
  boundary context persistent merely to relocate state.
- Keep persistence behavior in its existing repositories; do not silently
  serialize or clear additional state.
