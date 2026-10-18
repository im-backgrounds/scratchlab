# Overview

Recognize meaningful practice milestones using local progress data. Initial
achievement groups cover BPM clears, number of practice sessions, and
consecutive practice days.

See [practice history](practice-history.md), [roadmap](../roadmap.md), and
[milestones](../milestones.md).

# User Story

As a learner, I want milestones to acknowledge my practice and improvement, so
that I can see progress and stay motivated.

# Functional Requirements

- Include BPM achievements at 80, 100, 120, and 140 BPM.
- Include practice-count achievements at 10, 50, 100, and 500 sessions.
- Include consecutive-day achievements at 3, 7, and 30 days.
- Award each achievement at most once and preserve earned achievements across
  reloads.
- Derive achievement eligibility from validated challenge progress and
  [practice history](practice-history.md), rather than maintaining conflicting
  duplicate counters.
- A BPM milestone requires a valid BPM Challenge clear at or above the target
  BPM; an unscored or invalid-duration take is not a clear.
- A practice-count milestone counts one completed, valid practice session once;
  incomplete playback and duplicate lifecycle events must not inflate it.
- A streak day is a calendar day on which at least one valid practice session
  completes. Use the browser's local calendar date consistently and do not
  count multiple sessions on the same day as multiple streak days.
- Explain the earned milestone and the remaining progress for locked
  achievements where a meaningful denominator exists.
- Do not require sign-in or remote synchronization.

# UI Requirements

- Provide an achievement view grouped by BPM, practice count, and streak.
- Clearly distinguish earned from locked achievements with labels or icons,
  not color alone.
- On earning an achievement, provide a dismissible, non-blocking notification.
- Respect reduced-motion settings for notification animation.

# Data Model

Achievements have stable IDs, a category, a target, and presentation metadata.
Earned state should be derived from versioned local history/progress when
possible. If earned timestamps are stored for notifications, keep them in a
versioned local record:

```json
{
  "version": 1,
  "earned": {
    "bpm-80": "ISO-8601 timestamp"
  }
}
```

Do not store user identity or transmit practice events. Define migration and
reset behavior before implementation; deleting practice history must not leave
orphaned derived achievements.

# Acceptance Criteria

- Every listed threshold is represented with a stable achievement ID.
- Valid progress unlocks the corresponding achievement once; invalid or
  duplicate events do not award it.
- Practice streaks use distinct local calendar days and handle repeated
  sessions on one day correctly.
- Achievement state survives reload and can be reconciled with its source
  history.
- A user can understand earned and locked state without color alone.

# Future Extensions

- Course completion, accuracy, and personal-best achievements.
- Optional cross-device sync, only after an explicit privacy and account
  decision.
- Achievement collections and learner-selected goals.
