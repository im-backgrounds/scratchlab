# Overview

Keep a local record of completed practice sessions so learners can review
previous work and future features can analyze progress.

See [achievement system](achievement-system.md), [roadmap](../roadmap.md), and
[architecture decisions](../architecture-decisions.md).

# User Story

As a learner, I want a history of what I practiced and how accurately I
performed, so that I can recognize patterns in my progress.

# Functional Requirements

- Record these required fields for each completed, analyzable session:
  - `date`
  - `pattern`
  - `bpm`
  - `accuracy`
- A session must have a stable identifier and represent one completed practice
  attempt, not a playback loop or each individual input event.
- Save locally without requiring an account or network access.
- Do not create a successful-looking history entry when no usable performance or
  accuracy exists.
- Allow users to review history and provide a way to delete history.
- Bound stored history and define a retention policy before implementation;
  never silently grow LocalStorage without limit.
- Retain at most 500 completed challenge sessions, preserving the highest-BPM
  clear if it falls outside the recent records; keep the 30 most recent distinct
  local calendar days for achievement streaks.
- Treat missing/corrupt stored entries as invalid and preserve unrelated valid
  entries during normalization.
- Make history available to achievement and growth analysis without coupling
  those views to transient UI state.

# UI Requirements

- Show sessions in reverse chronological order with date, pattern, BPM, and
  accuracy.
- Provide an understandable empty state before the first completed session.
- Make deletion explicit and communicate that it affects dependent progress
  analysis.
- Format dates and accuracy consistently with the rest of the app.

# Data Model

Required logical record:

```json
{
  "id": "stable session identifier",
  "date": "ISO-8601 timestamp",
  "pattern": "stable pattern identifier",
  "bpm": 90,
  "accuracy": 95.5
}
```

Use a versioned top-level collection. Accuracy is a percentage in the range
0–100 and may use one decimal place to match current BPM Challenge results.
Represent unknown accuracy as absent/null only if a future product decision
explicitly allows incomplete records; initial history entries require valid
accuracy. Raw input events are not required by this schema; retain them only
when needed by replay or timing analysis, with separate limits and data
handling.

# Acceptance Criteria

- A completed valid session is stored with date, pattern, BPM, and accuracy.
- Failed or incomplete sessions do not create fabricated accuracy values.
- Records are ordered newest first and survive reload.
- Invalid records do not prevent other valid records from being displayed.
- History deletion is explicit and updates dependent summaries consistently.

# Future Extensions

- Per-pattern trends, best BPM, and rolling average accuracy.
- Export/import and bounded event-level replay data.
- Optional backup/sync after a separate privacy and architecture decision.
