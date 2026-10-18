# Development Task Backlog

This backlog follows the priority and release themes in the
[roadmap](roadmap.md). Items are planned work, not claims that a feature already
exists. Use the linked [feature specifications](feature-specs/) as the behavior
contract when implementation begins.

## v0.2 Learning Experience

1. [x] Improve first-visit guidance and make it skippable, resumable, and
   explicitly re-openable.
2. [x] Build the ordered Beginner course: [Baby Scratch](feature-specs/beginner-course.md),
   [Forward Scratch](feature-specs/beginner-course.md), Baby Scratch BPM90,
   Baby Scratch BPM100, then Chirp.
3. [ ] Add [keyboard input](feature-specs/keyboard-input.md) using the same
   normalized event model as MIDI and make it available to BPM Challenge.

## v0.3 Retention

4. [ ] Add [input audio monitoring](feature-specs/input-audio-monitoring.md)
   with separate SAMPLE/YOU levels and mute controls.
5. [ ] Add the [controller overlay](feature-specs/controller-overlay.md) for
   score-aligned expected and performed events.
6. [ ] Add the [achievement system](feature-specs/achievement-system.md) for
   BPM goals, practice counts, and practice streaks.
7. [ ] Add [practice history](feature-specs/practice-history.md) with date,
   pattern, BPM, and accuracy.
8. [ ] Add growth charts for practice volume, best BPM, and average accuracy,
   using the history data contract.

## v0.4 Social

9. [ ] Generate and download a performance summary image with pattern, BPM,
   accuracy, and rank.
10. [ ] Add share-text generation and an optional X sharing action.
11. [ ] Define and add Bronze, Silver, Gold, and Platinum performance ranks.

## v0.5 Analysis

12. [ ] Add [timing analysis](feature-specs/timing-analysis.md) for average
   error, maximum error, and accuracy; keep timing accuracy distinct from the
   current sequence-match score.
13. [ ] Add ghost comparison using the [controller overlay](feature-specs/controller-overlay.md).
14. [ ] Add event replay with seeking and score-aligned visualization.

## v1.0 Monetization exploration

15. [ ] Evaluate the [monetization concepts](feature-specs/monetization.md):
   Beginner Pack, Intermediate Pack, Battle Scratch Pack, DMC Practice Pack,
   Advanced Flare Pack, Pro Analysis, and Supporter Plan.
16. [ ] Before implementation, decide whether any paid offering can be
   delivered without an account or server, and document the resulting privacy,
   access-control, and payment requirements.

## Delivery rules

- Work in roadmap priority order and deliver one feature at a time.
- Before implementation, inspect the relevant code and update the plan if the
  implementation scope differs from its specification.
- Prototype Mode is the default; for this documentation-only workflow, do not
  modify application code, tests, README, or screenshots.
- Refer to [architecture decisions](architecture-decisions.md) and
  [Copilot instructions](../.github/copilot-instructions.md) for repository
  constraints.

## Alignment

The ordered task numbers map directly to the priority order in the roadmap:
the first three are v0.2, the next five v0.3, the next three v0.4, the next
three v0.5, and the final two v1.0. Update this list and the roadmap together
when priorities change.
