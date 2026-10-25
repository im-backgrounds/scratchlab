# Storage and Persistence Analysis

## Confirmed current behavior

- [`src/domain/chart-storage.js`](../../src/domain/chart-storage.js) detects
  usable browser LocalStorage.
  [`src/domain/storage-utils.js`](../../src/domain/storage-utils.js) catches
  exceptions around `getItem`, `setItem`, and `removeItem`; it does not define a
  shared repository schema.
- Feature repositories own their own keys, schemas, validation, migrations,
  normalization, failure states, and future-version protections. The main
  persisted formats include:

| Data                               | Key                          | Format/version                     | Owner                                                             |
| ---------------------------------- | ---------------------------- | ---------------------------------- | ----------------------------------------------------------------- |
| Saved charts and resumable session | `scratchlab.storage`         | 1                                  | [`chart-storage.js`](../../src/domain/chart-storage.js)           |
| Challenge progress                 | `scratchlab.challenge`       | 1                                  | [`bpm-challenge.js`](../../src/domain/bpm-challenge.js)           |
| Performance records                | `scratchlab.performance`     | 1                                  | [`performance.js`](../../src/domain/performance.js)               |
| Beginner Course progress           | `scratchlab.beginner-course` | 1                                  | [`beginner-course.js`](../../src/domain/beginner-course.js)       |
| Achievements                       | `scratchlab.achievements`    | 1                                  | [`achievement-system.js`](../../src/domain/achievement-system.js) |
| MIDI mapping                       | `scratchlab.midi-mapping`    | 4                                  | [`midi-mapping.js`](../../src/domain/midi-mapping.js)             |
| MIDI input preference              | `scratchlab.midi-input.v1`   | v1 key suffix; no envelope version | [`input-manager.js`](../../src/services/midi/input-manager.js)    |
| Ghost records                      | `scratchlab.ghost`           | 1                                  | [`ghost-storage.js`](../../src/domain/ghost-storage.js)           |
| Replay records                     | `scratchlab.replay`          | 1                                  | [`replay-storage.js`](../../src/domain/replay-storage.js)         |

- The chart repository stores saved charts and the resumable
  view/selection/draft session in its versioned envelope. Chart mutations
  re-read storage before writing and back up corrupt raw chart data before
  replacing it.
- Ghost and Replay data use separate stores. Ghost records accept the v2
  `eventModelVersion` and persist a Meaning Event timeline; Replay records
  persist a v2 replay context including loop states. See the
  [Ghost foundation](../ghost-foundation.md) and
  [Replay foundation](../replay-foundation.md) for their current integration
  limits.
- The repositories do not have one uniform migration policy. For example, chart
  storage has a v0-to-v1 migration, and MIDI mapping has its own migration
  logic. Future-version data is protected from overwrite where the repository
  reports that status.
- Application runtime state and Event Model boundary/matching context are not
  serialized wholesale. Event Model v2 is not the version of any of these
  storage formats.

Evidence: [`src/domain/chart-storage.js`](../../src/domain/chart-storage.js),
[`src/domain/storage-utils.js`](../../src/domain/storage-utils.js), the feature
repository links above,
[`docs/architecture-decisions.md`](../architecture-decisions.md),
[`docs/event-model-v2.md`](../event-model-v2.md).

## Proposed future design (not current behavior)

A future design could standardize repository interfaces or storage capability
injection while keeping schemas and migrations owned by their data domains. Such
an abstraction is not present beyond the low-level exception wrappers, and no
schema consolidation or migration is approved by this baseline.

## Compatibility constraints

- Preserve every existing key, serialized shape, version meaning, migration,
  validation rule, retention limit, and future-version protection unless a
  separately reviewed data-contract change explicitly replaces it.
- Preserve existing user data. Do not silently clear, rewrite, normalize on
  disk, or migrate records as a side effect of refactoring.
- Keep LocalStorage access failure behavior and repository-specific error
  outcomes visible to callers.
- Do not treat Event Model v2 as permission to change storage formats or
  re-score previously persisted records.
- Verify cross-tab behavior per repository before changing read/write
  sequencing; storage events and read-before-mutate logic are not uniform across
  all repositories.
