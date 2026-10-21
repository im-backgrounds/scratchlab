# GitHub Workflow

ScratchLab uses GitHub Issues to define and track work, the **ScratchLab
Development** Project to coordinate execution, and Pull Requests (PRs) to review
and integrate changes.

This document describes the current manual workflow. Project fields are not
automatically synchronized with Issue labels or repository documentation unless
an explicit GitHub automation is configured.
For the Project's status lifecycle, see [GitHub Project](github-project.md).

## Sources of Truth

| Information                              | Source of truth                           | Guidance                                                                                                                  |
| ---------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Scope, requirements, acceptance criteria | GitHub Issue                              | Keep implementation focused on the Issue. Clarify ambiguous or conflicting requirements before consequential changes.     |
| Execution status                         | ScratchLab Development Project `Status`   | Keep the Project item current as work progresses.                                                                         |
| Priority                                 | ScratchLab Development Project `Priority` | Use the matching `priority:p0` through `priority:p3` label for Issue search and filtering. Keep both values synchronized. |
| Work classification and affected areas   | GitHub Issue labels                       | Apply one `type:*` label and any relevant `area:*`, `docs:*`, and `test:*` labels.                                        |
| Product direction and verified backlog   | `docs/roadmap.md` and `docs/tasks.md`     | Update only when the Issue changes project direction or tracked product/validation work.                                  |
| Implementation and review record         | Pull Request                              | Link the Issue, document acceptance criteria, report actual checks, and explain documentation impact.                     |

Do not use the Project as a second copy of the Issue description or as a
replacement for the roadmap/task backlog. Project Priority and priority labels
intentionally duplicate a small amount of information; update both when
reprioritizing an Issue.

## Project Fields

The Project is named **ScratchLab Development** and has the following fields.

### Status

Move each Issue through the existing Status values:

| Status        | Use when                                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `Todo`        | The work is accepted into the Project but has not been triaged as ready or started.                                       |
| `Ready`       | Scope and acceptance criteria are clear enough to start; required decisions and dependencies are resolved.                |
| `In Progress` | Someone is actively investigating or implementing the Issue.                                                              |
| `Review`      | A PR is open and awaiting required checks, review, or follow-up changes.                                                  |
| `Done`        | Acceptance criteria are met, applicable checks are complete, and the work is integrated. Close the Issue when it is done. |

Keep an Issue in `Review` while requested changes or required checks remain
outstanding. If work resumes after review, move it back to `In Progress`. If
completed work is reopened, return it to the appropriate active status and
record why.

### Priority

Use the existing `Priority` values and matching labels:

| Project Priority | Issue label   | Meaning                                                                                     |
| ---------------- | ------------- | ------------------------------------------------------------------------------------------- |
| `P0`             | `priority:p0` | Urgent: major feature outage, data loss, or an equivalent issue requiring immediate action. |
| `P1`             | `priority:p1` | High: substantial impact on core functionality or scoring trustworthiness.                  |
| `P2`             | `priority:p2` | Normal: planned improvements and defects.                                                   |
| `P3`             | `priority:p3` | Low: limited impact; can be deferred.                                                       |

Assign one Project Priority and its corresponding label to each actively triaged
Issue. Reassess priority when impact, urgency, or dependencies change. Do not
infer priority from Issue type.

## Creating and Triageing Issues

1. Create an Issue from the appropriate template in `.github/ISSUE_TEMPLATE/`:
   Feature, Bug, Task, or Tech Debt. Use a blank Issue only when none of these fits,
   and assign the matching `type:task` label.
2. Complete the relevant sections: purpose or reproduction, scope, acceptance
   criteria, test conditions, and documentation update decisions. For scoring
   work, identify the affected BPM Challenge or Beginner Course behavior and
   Event Model v2 paths, such as Matching, Timing, initial state, Loop Boundary,
   Stop, or Overlay.
3. Templates assign the corresponding type label: `type:feature`, `type:bug`, or
   `type:tech-debt`. Add relevant `area:*`, `docs:*`, and `test:*` labels from
   `.github/labels.json`.
4. Add the Issue to **ScratchLab Development**. Set `Status` to `Todo`, choose
   the `Priority`, and apply the matching `priority:p*` label.
5. During triage, confirm the scope, acceptance criteria, test expectations,
   documentation impact, and dependencies. Move an actionable Issue to `Ready`.
   Split work into linked Issues when it is independently reviewable or has
   distinct acceptance criteria.

Do not mark an Issue `Ready` if a product or architecture decision necessary to
define its acceptance criteria is unresolved.

## Implementing an Issue with Copilot

1. Start from the Issue and treat its description and acceptance criteria as the
   scope of work. Read linked specifications and relevant existing code/tests.
2. Confirm the Issue is `Ready`; move it to `In Progress` when implementation
   begins. If a requirement is ambiguous, ask for clarification rather than
   silently choosing a consequential behavior.
3. Make a focused change for one Issue. Prefer a branch named
   `issue/<number>-<short-slug>` when creating a branch is part of the requested
   workflow. Do not switch branches, push, or create a PR without authorization.
4. Run relevant tests and checks. Report exact commands and results; identify
   any acceptance criteria or checks that remain outstanding.
5. Assess documentation in the same change:
   - Update `README.md` for user-visible behavior, setup, supported inputs, or
     limitations.
   - Update `docs/roadmap.md` for project priorities, milestone scope, or
     status.
   - Update `docs/tasks.md` when tracked implementation or validation tasks
     change.
   - Update feature specifications or architecture decisions when their
     contracts change.
   - If an update is not applicable, explain why in the PR.
6. Do not mark the Project item `Done` or close the Issue merely because code
   was written. Use the review and completion steps below.

Copilot instructions guide the workflow but do not themselves update Project
fields, create GitHub resources, or cause documentation to be committed
automatically. Perform those actions only when the active task and permissions
allow them.

## Pull Request and Review

1. Open a PR for the Issue and use `.github/PULL_REQUEST_TEMPLATE.md`.
2. Link the Issue with `Closes #<number>` only if the PR fully satisfies its
   acceptance criteria. Use `Refs #<number>` for partial work or when more
   follow-up is required.
3. Include a concise summary, acceptance criteria addressed, actual test/check
   results, documentation impact, remaining limitations, and relevant UI
   screenshots or browser verification.
4. Move the Project item to `Review` when the PR is ready for review. Keep it
   there while CI checks or requested review changes are pending.
5. Reviewers check correctness against the Issue, regression risk, tests,
   documentation, and data integrity. Resolve review feedback and rerun affected
   checks before requesting another review.
6. Merge only after applicable required checks pass and blocking review feedback
   is resolved. Follow repository branch-protection settings; this document does
   not assert that a particular approval count or protection rule is enabled.
7. After integration, confirm the Issue's acceptance criteria are complete, move
   its Project status to `Done`, and close it. If work is only partially
   complete, leave it open and create or link a follow-up Issue as needed.

The current Deno CI workflow runs on pushes and pull requests; consult
`.github/workflows/deno-ci.yml` for the exact checks configured. A check
mentioned in the README or PR template is not evidence that it passed—use the
actual command or GitHub Actions result.

## Label Conventions

- Apply exactly one Issue type label: `type:feature`, `type:bug`,
  `type:tech-debt`, or `type:task`.
- Apply one priority label matching the Project Priority.
- Add all relevant feature-area labels, including `area:bpm-challenge`,
  `area:event-model-v2`, `area:ghost`, `area:replay`, `area:midi`, `area:ui`,
  and `area:scoring`.
- Apply documentation and test labels when those kinds of work are included.
- Use `.github/labels.json` as the maintained definition of label names, colors,
  and descriptions. Its legacy mapping is a migration reference; do not apply
  legacy labels to new Issues.

## Project Maintenance

- Keep the Project focused on actionable repository Issues. Do not add every
  discussion or duplicate subtask when it does not need independent tracking.
- Keep status and priority current; Project fields do not replace Issue labels,
  acceptance criteria, PR checks, or documentation.
- Keep `docs/roadmap.md` focused on product direction and `docs/tasks.md` on
  product implementation and validation. This workflow document is the source
  for GitHub Project and PR operating procedures.
- Review this document when Project fields, templates, labels, CI checks, or
  repository review policy change.
