# Overview

Provide a guided sequence for learners who are unsure what to practice. The
course consists of five ordered stages: Baby Scratch, Forward Scratch, Baby
Scratch BPM90, Baby Scratch BPM100, and Chirp. Each stage unlocks only after
the previous stage is completed.

This is planned work. See the [roadmap](../roadmap.md) and
[v0.2 tasks](../tasks.md#v02-learning-experience).

# User Story

As a beginner, I want a clear first exercise and a next step that unlocks as I
make progress, so that I can practice without having to choose a pattern or
tempo on my own.

# Functional Requirements

- Show the stages in this fixed order:
  1. Baby Scratch
  2. Forward Scratch
  3. Baby Scratch BPM90
  4. Baby Scratch BPM100
  5. Chirp
- Lock all stages after the next incomplete stage.
- Allow the learner to replay completed stages.
- The BPM90 and BPM100 stages use Baby Scratch at their named target tempo;
  these fixed course targets are distinct from the user's personal BPM
  Challenge progression.
- A course stage is cleared by one valid performance at its target BPM with at
  least 90% event-sequence accuracy. A stage without a BPM target uses the
  selected/default practice tempo and the same accuracy threshold.
- Persist unlock/completion state locally and retain it across reloads.
- Do not mark an attempt complete when it has no analyzable accuracy.

# UI Requirements

- Provide a course overview with stage order, locked/available/completed state,
  and a clear next action.
- Explain why a stage is locked and which prior stage unlocks it.
- Show the selected stage's score, target tempo when applicable, and progress
  feedback.
- Keep normal practice and playback controls available when a stage is
  selected.
- Make completion status understandable without relying on color alone.

# Data Model

Course state is stored locally and versioned. Suggested logical shape:

```json
{
  "version": 1,
  "courseId": "beginner",
  "completedStageIds": ["baby-scratch"],
  "updatedAt": "ISO-8601 timestamp"
}
```

Use stable stage IDs rather than display names. The ordered catalog maps each
ID to its chart and optional target BPM. Progress is monotonic: completing a
later stage implies earlier stages are complete; malformed or unknown IDs are
ignored during normalization. Do not store transient playback or MIDI state.

# Acceptance Criteria

- A new learner sees all five stages in the required order.
- Only the first incomplete stage is available; completed stages remain
  replayable.
- A valid stage completion unlocks exactly the next stage and survives reload.
- Baby Scratch BPM90 and BPM100 use their named fixed target tempos.
- The course clear threshold and missing-accuracy behavior are consistent and
  visible to the learner.

# Future Extensions

- Optional written or audio guidance per stage.
- Alternate courses and adaptive recommendations.
- Course completion certificates or course-specific achievements.
