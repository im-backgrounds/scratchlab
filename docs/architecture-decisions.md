# Architecture Decisions

This document records the current technical constraints for ScratchLab. These
decisions guide future work; changing one requires an explicit review of the
features and constraints it affects.

## ADR-001: Prefer native JavaScript

**Status:** Accepted

Use browser-native JavaScript and ES modules for application behavior. Avoid
adding a framework or build-time abstraction unless a concrete product need
cannot be met cleanly with the existing structure.

## ADR-002: Deploy as a static GitHub Pages application

**Status:** Accepted

The application is hosted on GitHub Pages. Features should work without a
server-side runtime or API by default. Any feature that appears to require a
server must state why static hosting is insufficient and document deployment
implications before implementation.

## ADR-003: Minimize npm dependencies

**Status:** Accepted

Do not add npm dependencies for convenience when browser APIs or existing
project utilities suffice. A dependency proposal must explain its maintenance,
size, and deployment costs.

## ADR-004: Prefer local persistence

**Status:** Accepted

Use LocalStorage for small, browser-local preferences and progress when
appropriate. Version persisted formats, validate loaded data, and do not imply
that local data is backed up or synchronized. Consider browser storage limits
and user deletion.

## ADR-005: Keep the product serverless by default

**Status:** Accepted

Learning, practice, history, and achievements should not require a user account
or server. Remote sync, identity, billing, and paid access need explicit
architecture decisions; they are not implied by the monetization concepts.

## ADR-006: Preserve Deno test compatibility

**Status:** Accepted

Keep modules and tests compatible with the repository's Deno-based validation
workflow. If a code change affects business logic, follow the applicable
workflow's test requirements; a documentation-only change does not create or run
tests.

## ADR-007: Share one normalized input event model

**Status:** Accepted

MIDI and future keyboard input should be translated into the same semantic
events: scratch `forward`, `backward`, and `stop`, plus fader `open` and
`closed`. Downstream recording, analysis, and overlays should consume this model
rather than implement device-specific scoring. See the
[keyboard input](feature-specs/keyboard-input.md) and
[controller overlay](feature-specs/controller-overlay.md) specifications.

## ADR-008: Keep expected score separate from performed events

**Status:** Accepted

Expected score events and user performance events are separate sources. The
overlay and comparison features may render them together, but must retain their
source identity. Use blue for SAMPLE, green for YOU, and red for errors as
specified in the [controller overlay](feature-specs/controller-overlay.md).

## ADR-009: Define metric semantics before adding analysis

**Status:** Accepted

The existing BPM Challenge score compares event sequences and ignores timing. Do
not silently redefine it when adding timing metrics. Specify units, matching,
tolerance, and missing/extra event handling in
[timing analysis](feature-specs/timing-analysis.md) before implementation.

## Related documents

- [Product vision](vision.md)
- [Roadmap](roadmap.md)
- [Task backlog](tasks.md)
- [Milestones](milestones.md)
- [Copilot instructions](../.github/copilot-instructions.md)
