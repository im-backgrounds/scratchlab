# ScratchLab Copilot Instructions

Use the [product vision](../docs/vision.md), [roadmap](../docs/roadmap.md),
[task backlog](../docs/tasks.md), [milestones](../docs/milestones.md),
[architecture decisions](../docs/architecture-decisions.md), and relevant
[feature specifications](../docs/feature-specs/) as the product and technical
reference.

---

# Default workflow: Prototype Mode

- Prototype Mode is the default unless the user explicitly requests Stabilization Mode or Release Mode.
- Work on one roadmap task at a time and respect its priority.
- Inspect the relevant implementation before proposing or making code changes.
- Keep the change small and focused while fully satisfying the selected feature specification.
- Preserve existing behavior unless a specified behavior intentionally changes.
- For a documentation-only request, modify documentation only.
- Report:
  - changed files
  - implementation summary
  - manual verification steps
  - remaining work

## Scope Control

Implement only the requested task.

Do not automatically:

- Refactor unrelated code
- Rename files without necessity
- Change architecture without specification
- Add new frameworks
- Convert code to TypeScript
- Add dependencies without approval
- Modify unrelated features

Prefer multiple small commits over one large change.

---

# Architecture Constraints

## Technology Stack

ScratchLab uses:

- Native JavaScript
- HTML
- CSS
- Browser APIs

Do not introduce:

- TypeScript
- React
- Vue
- Angular
- jQuery
- Redux
- Zustand
- MobX

unless explicitly requested.

## Deployment

- Preserve the static GitHub Pages deployment model.
- Keep the application runnable without backend services.
- Prefer browser-native solutions.

## Dependencies

- Do not add npm dependencies without documented justification.
- Prefer native browser APIs.
- Prefer lightweight implementations.

## Storage

- Prefer LocalStorage for user data.
- Validate persisted data before use.
- Version storage formats when introducing breaking changes.
- UI components must not directly manipulate LocalStorage.
- Use repositories or storage abstraction modules.

Example:

```text
UI
 ↓
Repository
 ↓
Storage
 ↓
LocalStorage
```

## Testing

- Preserve Deno test compatibility.
- New business logic should include tests.
- Existing tests must continue to pass.
- Fix failing tests caused by the change.

---

# BPM Challenge Development Rules

## Product Goal

The BPM Challenge is the core feature of ScratchLab.

The purpose is to help users improve scratch timing, fader control, and pattern accuracy through repeatable practice and objective scoring.

## v1.0 Completion Criteria

v1.0 is considered complete when users can:

- Configure MIDI input
- Start a BPM Challenge
- Complete a challenge loop
- Record evaluation laps
- Receive a score
- Receive a rank
- Save results
- View challenge history
- View basic progress analytics
- Use the application through GitHub Pages

## Feature Priority

Development priority:

1. Evaluation Engine
2. Recording System
3. Challenge Flow
4. Results Screen
5. History
6. Analytics
7. Optional Enhancements

Do not prioritize cosmetic improvements over challenge functionality.

---

# BPM Challenge Scope Management

Before implementing any feature, determine whether it is required for BPM Challenge v1.0.

If not required:

- Do not implement immediately.
- Add to roadmap/tasks/milestones instead.

## Out of Scope for v1.0

Examples:

- AI coaching
- Online rankings
- User accounts
- Cloud sync
- Multiplayer
- Social features
- Audio waveform analysis
- Ghost battles
- Premium subscriptions
- Remote APIs

These ideas may be considered for future releases.

---

# BPM Challenge Architecture

Prefer separation between:

```text
src/features/challenge/

domain/
application/
ui/
```

## Domain Layer

Contains:

- scoring
- evaluation
- ranking
- challenge rules

Domain code:

- must be deterministic
- must not access DOM
- must not access LocalStorage
- must not perform rendering

## UI Layer

Responsible for:

- rendering
- user interaction
- visual feedback

UI should not calculate scores directly.

---

# Input Device Model

All input devices should be translated into shared semantic events.

Examples:

- MIDI
- Keyboard
- Mouse

should produce equivalent challenge events.

Avoid device-specific logic inside evaluation code.

Example:

```js
{
  timestamp: 123456,
  type: "scratch",
  value: 1
}
```

```js
{
  timestamp: 123789,
  type: "crossfader",
  value: 0
}
```

Evaluation logic should consume these common events.

---

# Documentation Consistency

Keep aligned:

- roadmap
- tasks
- milestones
- feature specifications

Distinguish between:

- shipped functionality
- planned functionality
- experimental concepts

Do not document behavior changes without first verifying the implementation.

## README Policy

When user-facing functionality changes:

Review whether README requires updates.

README updates are encouraged when:

- New features are added
- User workflows change
- Screenshots become inaccurate
- Setup instructions change

---

# Change Isolation Rules

When implementing a roadmap task:

- Modify only required files.
- Do not perform opportunistic refactoring.
- Do not reorganize directories unless required.
- Do not rewrite working systems.
- Avoid architecture changes without documented benefit.

Small focused pull requests are preferred.

---

# Explicit Workflow Overrides

## Stabilization Mode

When explicitly requested:

- Update affected tests
- Update affected documentation
- Fix technical debt in the touched area
- Improve maintainability

Do not expand beyondd test suite
- Verify challenge flow
- Verify MIDI configuration
- Verify history persistence
- Update README
- Update screenshots if needed
- Verify GitHub Pages deployment
- Verify no obvious console errors

---

# Copilot Task Execution Template

When implementing a task:

1. Read the relevant specification.
2. Inspect existing implementation.
3. Identify smallest possible change.
4. Implement only the requested scope.
5. Add tests if business logic changes.
6. Verify existing functionality remains intact.
7. Report:
   - changed files
   - implementation summary
   - validation performed
   - remaining work

Never expand task scope without explicit instruction.
