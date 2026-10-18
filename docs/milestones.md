# Milestones

Milestones group the themes in the [roadmap](roadmap.md) into verifiable product
outcomes. They are planning targets, not date commitments. The
[task backlog](tasks.md) is the execution checklist.

## v0.2 — Learning Experience

**Outcome:** a new learner can find a first exercise, follow a clear sequence,
and practice without owning a MIDI controller.

**Scope**

- First-visit tutorial.
- Ordered Beginner course, from Baby Scratch through Chirp.
- Keyboard input integrated with the MIDI event flow and BPM Challenge.

**Exit criteria**

- A first-time learner can start or skip guidance and later find it again.
- Course stages unlock in the specified order and show current progress.
- Forward, Backward, and Fader keyboard actions behave as normalized input
  events, not as a separate scoring implementation.

## v0.3 — Retention

**Outcome:** practice gives immediate feedback and leaves understandable
evidence of progress.

**Scope**

- Input audio monitoring with SAMPLE/YOU separation.
- Score-aligned controller overlay.
- BPM, practice-count, and streak achievements.
- Practice history and growth charts.

**Exit criteria**

- Input audio controls do not change the sample/demo source controls.
- Overlay distinguishes expected events, user events, and errors without relying
  on color alone.
- History retains the documented practice facts and supports analysis.
- Achievement and growth views derive from shared, documented progress data.

## v0.4 — Social

**Outcome:** a learner can present and share a concise practice result.

**Scope**

- Downloadable performance summary image.
- Share text and optional X sharing.
- Four performance ranks: Bronze, Silver, Gold, and Platinum.

**Exit criteria**

- A result identifies its pattern, BPM, accuracy, and rank.
- Sharing is optional and does not block local practice.

## v0.5 — Analysis

**Outcome:** learners can see how far their timing differs from the score and
review a performance.

**Scope**

- Average timing error, maximum timing error, and timing accuracy.
- Ghost comparison.
- Performance replay with seeking and event visualization.

**Exit criteria**

- Timing metrics have documented units, matching rules, and tolerance.
- Timing accuracy is explicitly distinguished from BPM Challenge's existing
  event-sequence accuracy.
- Replay and ghost comparison use a stable event/time representation.

## v1.0 — Monetization exploration

**Outcome:** viable paid/support options are evaluated without undermining the
free learning path.

**Scope**

- Beginner, Intermediate, Battle Scratch, DMC Practice, and Advanced Flare
  packs.
- Pro Analysis.
- Supporter Plan.

**Exit criteria**

- Each offering has a defined audience, content boundary, free/paid boundary,
  and maintenance cost.
- Account, payment, access control, privacy, and offline behavior decisions are
  documented before any transaction implementation.
- No paid feature is represented as available before it is delivered.

## Cross-milestone gates

- Keep the [vision](vision.md), roadmap, backlog, and feature specifications
  mutually consistent.
- Preserve the constraints in
  [architecture decisions](architecture-decisions.md).
- Use Prototype Mode by default; stabilization and release work require an
  explicit mode change. See
  [Copilot instructions](../.github/copilot-instructions.md).
