# ScratchLab Copilot Instructions

## Project

ScratchLab is a browser-based DJ scratch training application. Prioritize
scoring correctness, data integrity, learner understanding, and maintainable
code.

Use **Prototype Mode** by default. Stabilization or release work requires an
explicit request to change modes. Agreed goals are tracked in
[GitHub Milestones](https://github.com/im-backgrounds/scratchlab/milestones).

## Issue-Driven Workflow

Treat the GitHub Issue as the source of scope and acceptance criteria.

1. Before editing, inspect the issue description, acceptance criteria, relevant
   code, tests, and linked project documentation. If an issue number is
   supplied, keep it associated with the work and use it in the eventual PR
   description.
2. Break the issue into verifiable outcomes. Implement only the requested scope;
   call out blockers, conflicts, and out-of-scope discoveries instead of
   silently expanding the change.
3. If requirements or acceptance criteria are ambiguous, ask before making a
   consequential product or architecture decision. Do not invent issue details,
   change issue metadata, or close an issue unless explicitly asked.
4. Keep documentation and tests in sync with the delivered behavior. Before
   finishing, report what changed, which checks ran, their results, and any
   checks or acceptance criteria still outstanding.

Before editing, start each Issue on its own branch from an up-to-date `main`,
named `issue/<number>-<short-slug>`. For work without an Issue, also create a
dedicated branch from an up-to-date `main` before editing. Creating that work
branch is part of the implementation workflow. Never commit directly to `main`.
Continue related edits and commits on the same branch through PR creation;
resume its existing branch for follow-up work rather than creating another. Do
not mix different Issues or unrelated changes on one branch.

Fetch `origin` before starting new work and update a clean `main` only by
fast-forward. If it has local-only commits, has diverged, or the worktree has
conflicting changes, stop and ask; do not reset, rewrite, or discard them. After
PR creation, return to `main` with a clean worktree. After merge (especially
squash merge), fetch and fast-forward `main` before the next task. If
fast-forward fails, ask rather than replaying already integrated commits.

Follow the [GitHub workflow](../docs/github-workflow.md) for Project status,
priority, Issue triage, PR review, and completion procedures. Use the
[README policy](../docs/readme-policy.md) to assess README changes and the
[label guide](../docs/labels.md) for current Issue labels.

Always create GitHub Issues through a script using GitHub CLI or the GitHub API,
not an interactive Issue-creation tool or form. Check for duplicates before
creation and re-fetch the created Issue to verify its body and labels. Add every
leaf Issue (an Issue with no sub-Issues, including a standalone or parent Issue
without children) to **ScratchLab Development**. For nested hierarchies, track
the leaf sub-Issues; a parent alone is not sufficient. Check existing membership
to avoid duplicates, preserve existing Project items, and verify membership,
Status, and Priority after registration. If Project permissions are missing,
report the blocker rather than claiming completion.

When creating an Issue, assign an appropriate Open milestone using a script.
Reuse one whose purpose and completion criteria match; create a milestone with a
description only when none fits and the work grouping is clear. If selection is
ambiguous, ask rather than inventing a milestone. Do not create one per Issue,
automatically reuse or reopen Closed milestones, or infer a release commitment
or due date. Set a due date only when explicitly specified. Re-check before
creation and re-fetch the assignment afterward to prevent duplicates and verify
success. Milestones do not replace Project registration; follow the detailed
[milestone policy](../docs/github-workflow.md#milestone-assignment).

## Documentation Updates

At the end of each issue, assess documentation against the actual change:

- Update [README.md](../README.md) when user-visible behavior, setup, supported
  inputs, or user-facing limitations change. Do not edit it for internal-only
  refactors.
- Update the GitHub Issue, Project Status/Priority, and Milestone when tracked
  work, priorities, or agreed scope changes. Mark work complete only after its
  acceptance criteria have been implemented and verified. Do not duplicate
  progress in the legacy roadmap, tasks, or milestones Markdown pages.
- Update feature specifications or architecture decisions when their contracts
  change; do not copy their detailed design into the README.

Review README and specification updates with the implementation, and report the
actual GitHub planning updates when applicable. These are workflow requirements,
not a promise that GitHub Actions will generate or commit documentation
automatically. State explicitly when no documentation update is needed.

## Pull Requests and Commits

When a review requests changes or Deno CI fails, inspect the review threads or
failed checks, fix the underlying issue on the same PR branch, rerun the
relevant checks, and request a fresh review. Do not treat an automated follow-up
comment as evidence that the fix or review has already happened.

When working in a local environment, use GitHub CLI (`gh pr create` and
`gh pr edit`) for PR creation and editing, not interactive PR tools or MCP write
operations. If `gh` or authentication is unavailable locally, report the blocker
rather than changing tools silently. This CLI requirement does not apply to
Copilot running on GitHub; it may use its available standard tools. Do not
include a `gh` requirement when delegating work to Copilot on GitHub.

Follow the checked-in [pull request template](PULL_REQUEST_TEMPLATE.md). When
preparing a PR, include:

- A concise summary of the change
- `Closes #<issue>` only when the PR fully satisfies that issue; otherwise use
  `Refs #<issue>`
- Acceptance criteria addressed and any remaining limitations
- Tests and checks run, with results
- README/specification impact and Issue/Project/Milestone updates
- Screenshots or browser verification for user-facing UI changes, when useful

Keep one issue per PR and do not claim checks passed unless they were actually
run or the Actions result is available.

Use exactly one matching type label for each Issue:

- `type:feature` for feature requests
- `type:bug` for bug reports
- `type:tech-debt` for refactoring and maintenance work

The Issue templates apply these labels by default. Keep legacy label migration
consistent: `enhancement` → `type:feature`, `bug` → `type:bug`, and `refactor` →
`type:tech-debt`. Migrate existing Issues to the new labels before deleting
legacy labels. Do not apply the old labels to new Issues.

Do not create commits, push, or open/merge a PR unless explicitly requested.
When asked to commit, use a Conventional Commit subject:
`<type>(<optional-scope>): <imperative summary>`, for example
`fix(scoring): preserve fader state at loop boundaries`. Use an appropriate type
such as `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, or `ci`. Keep
commits focused and do not include unrelated changes.

## Validation and GitHub Actions

Use Deno 2 and the checks documented in [README.md](../README.md). Run the
narrowest relevant tests during development, then the applicable full checks
before completion:

```sh
deno test --allow-read=tests/ui/snapshots --ignore=tests/e2e
deno check src/app.js tests/domain/*.js tests/features/*.js tests/state/*.js tests/ui/*.js
deno fmt --check --unstable-component --ignore='tests/ui/snapshots/*.svg' .
deno lint src tests
git diff --check
```

When changing MIDI E2E coverage or its setup, also run the E2E checks from the
repository root:

```sh
cd tests/e2e
deno task check
deno task test
```

The [Deno CI workflow](workflows/deno-ci.yml) runs formatting, type checking,
unit tests, and a separate MIDI E2E job on pushes and pull requests. Use it as
the final integration gate; report failing or unavailable checks rather than
working around them. The [GitHub Pages workflow](workflows/github-pages.yml)
deploys on pushes to `main`; do not push directly to `main` to trigger a deploy.
Actions validate and deploy the repository; they do not automatically update
README, specifications, or GitHub planning records.

## Architecture and Data

- Follow the existing separation of domain logic, application workflows, and UI.
  Keep new business rules independent of DOM rendering where practical, and
  follow established module boundaries rather than duplicating behavior.
- The app uses browser-native JavaScript ES modules and static GitHub Pages
  hosting. Avoid adding frameworks, build steps, server dependencies, or npm
  packages without a concrete need and a documented trade-off. Preserve Deno
  compatibility.
- LocalStorage is used for browser-local data. Preserve existing data and
  formats; never silently clear or rewrite user data. Document storage changes
  and provide a reviewed migration plan when one is necessary. Follow
  [architecture decisions](../docs/architecture-decisions.md).

## Scoring and Event Model

Event Model v2 is the current scoring model and its foundation is complete.
Check GitHub Issues and Project priorities for outstanding contract defects; do
not treat the model migration as ongoing or the foundation as proof that every
chart and environment is correct.

- Read [event-model-v2.md](../docs/event-model-v2.md) and the applicable feature
  specification before changing scoring, timing, overlays, or challenge flow.
- BPM Challenge and Beginner Course use the shared scoring engine. Mouse,
  keyboard, and MIDI inputs must produce equivalent analysis; do not add
  chart-specific scoring rules or a second event model.
- Meaning Events are Forward Stroke, Backward Stroke, Fader Open, and Fader
  Close. Direction changes create stroke events; continued motion in the same
  direction does not. Fader changes do not reset direction state. Stop and Loop
  Boundary are observations/structural markers, not scored player actions.
- Accuracy measures sequence correctness. Timing Analysis measures temporal
  precision from the shared matching results; it must not redefine accuracy or
  affect pass/fail.
- Overlay must project the same Expected Timeline, recorded events, and matching
  results used by analysis. Do not implement separate scoring or event
  generation for SAMPLE, YOU, or ERROR.
- Scoring changes require focused unit, regression, and boundary tests. Cover
  Missing/Extra events, initial state, loop boundaries, Stop handling, timing,
  and the affected chart/input paths. Ideal input for applicable acceptance
  charts should retain its specified result.

Consult [score-format.md](../docs/score-format.md) when changing chart notation
or chart data, and follow the applicable instructions under
`.github/instructions/`.

## Product and Feature Constraints

- Ghost and Replay foundations are partially implemented. Use GitHub Issues,
  Milestones, and their feature documents to determine scope and prerequisites;
  do not assume a foundation means the user-facing feature is complete.
- Do not imply that Project candidates or monetization concepts are committed
  work or available product features.
- When priorities conflict, prefer scoring correctness, data integrity, and
  clear learner feedback over visual polish or adding features.
