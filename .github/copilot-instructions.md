# ScratchLab Copilot Instructions

## Project

ScratchLab is a browser-based DJ scratch training application. Prioritize
scoring correctness, data integrity, learner understanding, and maintainable
code.

Use **Prototype Mode** by default. Stabilization or release work requires an
explicit request to change modes. See [milestones](../docs/milestones.md).

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

For issue branches, prefer `issue/<number>-<short-slug>`. Do not switch
branches, push, or create a branch unless requested or the task's workflow
explicitly requires it. Keep a change focused on one issue.

Follow the [GitHub workflow](../docs/github-workflow.md) for Project status,
priority, Issue triage, PR review, and completion procedures.
Use the [README policy](../docs/readme-policy.md) to assess README changes and
the [label guide](../docs/labels.md) for current Issue labels.

## Documentation Updates

At the end of each issue, assess documentation against the actual change:

- Update [README.md](../README.md) when user-visible behavior, setup, supported
  inputs, or user-facing limitations change. Do not edit it for internal-only
  refactors.
- Update [roadmap.md](../docs/roadmap.md) when priorities, milestone scope, or
  project status changes. Mark work complete only after its acceptance criteria
  have been implemented and verified.
- Update [tasks.md](../docs/tasks.md) when tracked implementation or validation
  tasks change state. Keep it consistent with the roadmap and issue outcome.
- Update feature specifications or architecture decisions when their contracts
  change; do not copy their detailed design into the README.

Review README, roadmap, and task updates in the same change as the
implementation when applicable. These are agent workflow requirements, not a
promise that GitHub Actions will generate or commit documentation automatically.
State explicitly when no documentation update is needed.

## Pull Requests and Commits

Follow the checked-in [pull request template](PULL_REQUEST_TEMPLATE.md). When
preparing a PR, include:

- A concise summary of the change
- `Closes #<issue>` only when the PR fully satisfies that issue; otherwise use
  `Refs #<issue>`
- Acceptance criteria addressed and any remaining limitations
- Tests and checks run, with results
- README, roadmap, and task-documentation impact
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
README or roadmap content.

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

Event Model v2 is complete and is the current scoring model; verify current
priorities in the roadmap rather than treating the migration as ongoing.

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

- Ghost and Replay foundations are partially implemented. Use the roadmap and
  their feature documents to determine current scope and prerequisites; do not
  assume a foundation means the user-facing feature is complete.
- Do not imply that roadmap candidates or monetization concepts are committed
  work or available product features.
- When priorities conflict, prefer scoring correctness, data integrity, and
  clear learner feedback over visual polish or adding features.
