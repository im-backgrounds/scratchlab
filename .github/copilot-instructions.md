# ScratchLab Copilot Instructions

Use the [product vision](../docs/vision.md), [roadmap](../docs/roadmap.md),
[task backlog](../docs/tasks.md), [milestones](../docs/milestones.md),
[architecture decisions](../docs/architecture-decisions.md), and relevant
[feature specifications](../docs/feature-specs/) as the product and technical
reference.

## Default workflow: Prototype Mode

- Prototype Mode is the default unless the user explicitly requests
  Stabilization Mode or Release Mode.
- Work on one roadmap task at a time and respect its priority.
- Inspect the relevant implementation before proposing or making code changes.
- Keep the change small and focused while fully satisfying the selected
  feature specification.
- Preserve existing behavior unless a specified behavior intentionally changes.
- Do not update README files, screenshots, or tests in Prototype Mode.
- For a documentation-only request, modify documentation only; do not change
  application code, tests, README files, or screenshots.
- Report changed files, what changed, manual verification steps when applicable,
  and remaining work.

## Architecture constraints

- Prefer native JavaScript and existing browser APIs.
- Preserve the static GitHub Pages deployment model.
- Do not add npm dependencies without a documented need.
- Prefer LocalStorage for small, local-only data; version and validate
  persisted formats.
- Prefer serverless behavior. Accounts, sync, payments, and remote services
  require explicit architecture and privacy decisions.
- Preserve Deno test compatibility.
- Translate input devices into the shared semantic events described in
  [architecture decisions](../docs/architecture-decisions.md).
- Do not conflate BPM Challenge sequence accuracy with future timing accuracy.

## Documentation consistency

- Keep roadmap priorities, task order, and milestone scope aligned.
- Link feature work to its feature specification and update directly related
  documentation when the user requests documentation work or when the selected
  workflow requires it.
- Treat the BPM Challenge specification as a description of existing behavior;
  verify current source before documenting any behavior change.
- Distinguish shipped behavior, planned work, and exploratory concepts.

## Explicit workflow overrides

- Stabilization Mode: update directly related tests and documentation, inspect
  the affected scope, and perform relevant cleanup only.
- Release Mode: follow the release checklist in the roadmap, including the
  required test suite, README and screenshot updates, and deployment checks.
- A user-specified scope or prohibition takes precedence over optional workflow
  tasks; do not expand the change beyond that request.
