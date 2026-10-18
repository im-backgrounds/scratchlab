# ScratchLab Product Vision

## Purpose

ScratchLab is a browser-based practice app that helps people learn DJ scratch
technique by connecting what they see in a score, hear in a demo, and perform
through an input device.

## Users

- Beginners who need a clear first exercise and a path to the next one.
- Learners without DJ hardware who need an accessible way to practice.
- DJs who want repeatable drills, feedback, and a record of their practice.

## Desired learning loop

1. Choose an exercise appropriate to the learner's level.
2. Read and listen to the score.
3. Practice with a controller or supported keyboard input.
4. Hear the user's input and compare it with the score.
5. Review performance and timing feedback.
6. Save progress, identify improvement, and choose what to practice next.

## Product principles

- Make the next useful practice action obvious, especially for a first-time
  user.
- Keep score, playback, and input behavior consistent across input devices.
- Give learners immediate audio and visual feedback without obscuring the score.
- Make progress understandable and motivating without requiring an account.
- Keep the core practice experience usable in a browser with a simple
  deployment.
- Treat scoring and saved data as explicit, documented product behavior.

## Product boundaries

- The primary product is a practice and learning tool, not a DJ performance
  workstation or social network.
- A server, account system, and payment processing are not prerequisites for
  learning features.
- Monetization is exploratory and must not compromise the usable free learning
  path.
- Features described as future work are not promises of a delivery date.

## Current foundation

Score display, audio playback, MIDI input, BPM Challenge, input recording, and
performance comparison are implemented. Their current behavior is documented in
the [BPM Challenge specification](feature-specs/bpm-challenge.md) and the
existing [score format reference](score-format.md).

## Near-term direction

Improve the beginner learning path first, then enable keyboard practice, input
audio monitoring, and a score-aligned input overlay. Follow with achievements,
practice history, and growth analysis. See the [roadmap](roadmap.md), its
[task backlog](tasks.md), and [milestones](milestones.md).
