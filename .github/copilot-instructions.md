# ScratchLab Copilot Instructions

## Project Overview

ScratchLab is a browser-based scratch DJ training application.

Core goals:

- Practice scratch patterns
- Compare performance against score data
- Visualize improvement
- Complete BPM Challenges
- Build a foundation for future Ghost Comparison

The project prioritizes:

1. Scoring accuracy
2. Learning effectiveness
3. Clear visual feedback
4. Maintainable architecture

---

# Architecture Principles

Keep responsibilities separate.

## Domain

Business logic only.

Examples:

- BPM Challenge
- Performance Analysis
- Timing Analysis
- Achievement System
- Beginner Course

Rules:

- No DOM access
- No browser APIs
- Easily unit testable

---

## Features

Application workflows.

Examples:

- Challenge execution
- Practice flow
- Achievement updates

Rules:

- Coordinate domain modules
- Avoid direct rendering logic

---

## UI

Rendering only.

Rules:

- No business logic
- No scoring calculations
- No persistence decisions

---

# BPM Challenge Principles

The BPM Challenge is the primary product feature.

Requirements:

- Results must be reproducible
- Scoring must be deterministic
- Mouse and MIDI should produce equivalent results
- Timing Analysis must not affect pass/fail conditions
- Previous results must remain understandable

Never change challenge scoring without reviewing:

- docs/event-model-v2.md
- docs/feature-specs/bpm-challenge.md

---

# Event Model v2

The project is migrating to Event Model v2.

Read before modifying:

- docs/event-model-v2.md

Current priority:

- Event Model v2 migration

Do not introduce alternative scoring models.

Do not add special-case scoring rules for individual charts.

Scoring, Timing Analysis, Overlay and Beginner Course must share the same event model.

---

# Event Model Concepts

Meaningful player actions are evaluated.

Target events:

- Forward Stroke
- Backward Stroke
- Fader Open
- Fader Close

Special events:

- Stop
- Loop Boundary

Principles:

- Direction changes create stroke events
- Continuous movement in the same direction does not
- Fader changes do not reset direction state
- Loop boundaries are not player actions
- Stop is not scored directly

---

# Timing Analysis Rules

Timing Analysis is separate from Accuracy.

Accuracy:

- Sequence correctness

Timing Analysis:

- Temporal precision

Never merge these concepts.

Current metrics:

- Average Error
- Max Error
- Timing Accuracy

Timing Accuracy must never replace Accuracy.

---

# Overlay Rules

Overlay must visualize the same model used by scoring.

Avoid creating separate event-generation logic for:

- SAMPLE
- YOU
- ERROR

Whenever possible:

Expected Timeline
→ Matching Engine
→ Overlay

Use one shared source of truth.

---

# Beginner Course Rules

Beginner Course and BPM Challenge must use the same scoring engine.

Do not create:

- Beginner-specific scoring
- Beginner-only event models
- Alternate matching rules

Only progression requirements may differ.

---

# Persistence Rules

LocalStorage is the primary persistence layer.

Rules:

- Preserve backward compatibility unless a migration is planned
- Never silently delete user data
- Document all storage changes
- Include migration strategy when changing score-related data

---

# Testing Requirements

Scoring-related changes require tests.

Minimum expectations:

- Unit tests
- Regression tests
- Boundary-condition tests

Priority charts:

- Baby Scratch
- Forward Scratch
- Backward Scratch
- Chirp Scratch
- Transformer Scratch
- 1 Click Flare Orbit

Ideal performance input should score 100%.

---

# Performance Analysis Requirements

When modifying:

- performance-analysis.js
- performance.js
- midi-mapping.js
- challenge-session.js

Always verify:

- Accuracy calculation
- Missing events
- Extra events
- Timing Analysis
- Loop boundaries
- Stop handling

A change is not complete until tests verify all affected areas.

---

# Development Workflow

Before implementation:

1. Read related feature specification
2. Read event-model-v2.md if scoring is affected
3. Review existing tests
4. Minimize scope

After implementation:

1. Run tests
2. Run type checking
3. Verify browser behavior
4. Update documentation if behavior changed

---

# Preferred Decision Order

When trade-offs occur:

1. Correct scoring
2. Data integrity
3. User understanding
4. Visual polish
5. New features

Prefer fewer, correct features over more, unreliable features.

---

# Future Features

Do not start these features until Event Model v2 is complete:

- Ghost Comparison
- Replay Viewer
- Ranking System

These depend on a reliable scoring foundation.

Event Model v2 completion is the highest priority technical milestone.
