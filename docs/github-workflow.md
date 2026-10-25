# GitHub Workflow

ScratchLab uses GitHub Issues to define and track work, the **ScratchLab
Development** Project to coordinate execution, and Pull Requests (PRs) to review
and integrate changes.

This document describes the current manual workflow. Project fields are not
automatically synchronized with Issue labels or repository documentation unless
an explicit GitHub automation is configured. For the Project's status lifecycle,
see [GitHub Project](github-project.md).

## Sources of Truth

| Information                              | Source of truth                                     | Guidance                                                                                                                  |
| ---------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Scope, requirements, acceptance criteria | GitHub Issue                                        | Keep implementation focused on the Issue. Clarify ambiguous or conflicting requirements before consequential changes.     |
| Execution status                         | ScratchLab Development Project `Status`             | Keep the Project item current as work progresses.                                                                         |
| Priority                                 | ScratchLab Development Project `Priority`           | Use the matching `priority:p0` through `priority:p3` label for Issue search and filtering. Keep both values synchronized. |
| Work classification and affected areas   | GitHub Issue labels                                 | Apply one `type:*` label and any relevant `area:*`, `docs:*`, and `test:*` labels.                                        |
| Product principles and boundaries        | `docs/vision.md`                                    | Keep stable product principles and non-goals in version control.                                                          |
| Agreed outcomes and scope                | GitHub Milestones                                   | Describe completion criteria; do not imply a due date or release promise.                                                 |
| Work backlog and planning candidates     | GitHub Issues and Project overview                  | Use Issues for actionable work; keep uncommitted candidates explicit in the Project overview.                             |
| Specifications and technical constraints | Repository feature specs and architecture decisions | Review behavior contracts with code; do not move them into a progress checklist.                                          |
| Implementation and review record         | Pull Request                                        | Link the Issue, document acceptance criteria, report actual checks, and explain documentation impact.                     |

Do not use the Project as a second copy of the Issue description. GitHub is the
planning source of truth; the legacy roadmap/tasks/milestones pages are link
guides only. Project Priority and priority labels intentionally duplicate a
small amount of information; update both when reprioritizing an Issue.

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

1. Always create Issues through a script using GitHub CLI or the GitHub API, not
   an interactive Issue-creation tool or form. Use the appropriate template in
   `.github/ISSUE_TEMPLATE/` as the body structure: Feature, Bug, Task, or Tech
   Debt, unless the request explicitly specifies another structure. Use a blank
   Issue only when none of these fits, and assign the matching `type:task`
   label. Check Open and Closed Issues for duplicates before creation; re-fetch
   each created Issue to verify its body and labels.
2. Complete the relevant sections: purpose or reproduction, scope, acceptance
   criteria, test conditions, and documentation update decisions. For scoring
   work, identify the affected BPM Challenge or Beginner Course behavior and
   Event Model v2 paths, such as Matching, Timing, initial state, Loop Boundary,
   Stop, or Overlay.
3. Templates assign the corresponding type label: `type:feature`, `type:bug`, or
   `type:tech-debt`. Add relevant `area:*`, `docs:*`, and `test:*` labels from
   `.github/labels.json`.
4. Add every leaf Issue to **ScratchLab Development**: all sub-Issues with no
   children, and any standalone or parent Issue with no sub-Issues. For nested
   hierarchies, registering only a parent is not sufficient. Check existing
   membership to avoid duplicates and preserve existing Project items, even when
   a parent later gains children. For newly added items, set `Status` to `Todo`,
   choose the `Priority`, and apply the matching `priority:p*` label. Preserve
   existing Status values unless a workflow transition is intended. Re-fetch
   membership and field values to verify registration. If Project permissions
   are unavailable, report the unregistered Issues and the required permission
   instead of treating Issue creation as fully complete.
5. Assign an appropriate Open milestone using the policy below. Milestone
   assignment does not replace Project registration.
6. During triage, confirm the scope, acceptance criteria, test expectations,
   documentation impact, and dependencies. Move an actionable Issue to `Ready`.
   Split work into linked Issues when it is independently reviewable or has
   distinct acceptance criteria.

Do not mark an Issue `Ready` if a product or architecture decision necessary to
define its acceptance criteria is unresolved.

### Milestone assignment

- Use a script with GitHub CLI or the GitHub API to select, create, and assign
  milestones when creating Issues.
- Inspect existing Open and Closed milestones. Reuse an Open milestone only when
  its purpose and completion criteria fit the work; a matching title alone is
  not sufficient. Do not automatically reuse or reopen a Closed milestone.
- If no appropriate Open milestone exists and the work grouping is clear, create
  one with a description of its purpose and completion criteria. Do not create a
  separate milestone for every Issue. If the grouping or selection is ambiguous,
  ask before creating or assigning one.
- An Issue can have only one milestone. Do not infer it solely from the parent
  Issue: use the agreed work grouping, and ask if a parent theme and a release
  milestone conflict. Do not replace an existing assignment without checking its
  intent.
- A milestone is not a new product or release commitment. Keep its scope
  consistent with the product vision and agreed GitHub plan, and set a due date
  only when explicitly specified.
- Re-check existing milestones immediately before creation. If another process
  may have created one, re-read and reconcile the result rather than blindly
  retrying creation. Stop and report ambiguous duplicates; do not silently pick,
  delete, or close one.
- Re-fetch the milestone and the Issue after assignment to verify the
  milestone's identity, Open state, description, and the Issue's assignment.
  Report missing permissions or a failed assignment as incomplete work.
- This policy applies to future Issue creation. Bulk reassignment of existing
  Issues requires an explicit request. Continue registering leaf Issues in
  **ScratchLab Development** and verifying its fields independently.

### Batch creation for the Test Quality Improvement project

Use `scripts/create-test-quality-issues.js` to create or reconcile the
predefined Epic and child-Issue set with GitHub CLI. Install `gh` and
authenticate it for `github.com` first. The script reads label definitions from
`.github/labels.json`, creates the `Test Quality Improvement` milestone if it
does not exist, reuses unique exact-title matches, preserves existing labels,
and adds missing GitHub Sub-Issue links.

This script is specific to that predefined Issue set; do not run it to create
unrelated Issues. The Project registration and verification requirements above
also apply to scripted batch creation; do not assume this script performs them.

Run a read-only plan first:

```sh
deno run --allow-read=.github/labels.json --allow-run=gh scripts/create-test-quality-issues.js
```

Apply the plan only after reviewing it:

```sh
deno run --allow-read=.github/labels.json --allow-run=gh scripts/create-test-quality-issues.js --apply
```

The script stops before making changes if an exact planned title is ambiguous.
Resolve duplicates explicitly with `--select <issue-key>=<number>`, for example
`--select midi-settings=28`; do not choose an existing Epic without reviewing
its scope. The script does not close or delete duplicate Issues.

## Implementing an Issue with Copilot

1. Start from the Issue and treat its description and acceptance criteria as the
   scope of work. Read linked specifications and relevant existing code/tests.
2. Confirm the Issue is `Ready`; move it to `In Progress` when implementation
   begins. If a requirement is ambiguous, ask for clarification rather than
   silently choosing a consequential behavior.
3. Make a focused change for one Issue. Before editing, create its
   `issue/<number>-<short-slug>` branch from an up-to-date `main`, or resume the
   existing branch for that Issue. Follow the branch lifecycle below. Creating
   the work branch is part of implementation; commits, pushes, and PR creation
   still require explicit authorization.
4. Run relevant tests and checks. Report exact commands and results; identify
   any acceptance criteria or checks that remain outstanding.
5. Assess documentation in the same change:
   - Update `README.md` for user-visible behavior, setup, supported inputs, or
     limitations.
   - Update the Issue, Project Status/Priority, and Milestone for tracked work,
     priorities, and agreed scope. Do not duplicate these in Markdown backlogs.
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

### Branch lifecycle (all workstations)

These rules are version-controlled in `.github/copilot-instructions.md` so
Copilot can use the same workflow on each workstation. They guide agent
behavior, not enforce local Git commands. GitHub CLI (`gh`) must be installed
and authenticated on each local workstation to create or edit PRs. Copilot
running on GitHub is not subject to this CLI requirement.

- Never commit directly to `main`.
- Create one branch per Issue from an up-to-date `main`, using
  `issue/<number>-<short-slug>`.
- Work without an Issue also starts on a dedicated branch from an up-to-date
  `main`, for example `chore/shared-branch-workflow` or `docs/testing-guide`.
- Keep related edits and commits on that branch through PR creation. Resume the
  same branch for review fixes. Do not mix unrelated changes or Issues.
- Branch creation is part of implementation. Commit, push, PR creation, and
  merge still require explicit authorization; branch creation alone grants none
  of those permissions.

With a clean worktree, start new Issue work with:

```sh
git fetch origin
git switch main
git merge --ff-only origin/main
git switch -c issue/<number>-<short-slug>
```

For work without an Issue, substitute the dedicated branch name in the last
command. If `main` contains local-only commits, is diverged, or the worktree
contains conflicting changes, stop and ask before changing it. Do not reset,
rewrite, discard, or automatically replay those commits.

In local environments, create and edit PRs with `gh pr create` and `gh pr edit`,
using the checked-in template. Do not use interactive PR tools or MCP write
operations locally. If GitHub CLI or its authentication is unavailable locally,
report the blocker. Copilot running on GitHub may use its available standard
tools; do not require `gh` in requests delegated to it. The PR template and
validation requirements still apply in both environments.

After PR creation, return to `main` with a clean worktree. After merge, fetch
and fast-forward `main` before starting another branch. A squash merge creates
new commit IDs; do not treat the old work-branch commits as missing changes or
replay them onto `main`. If synchronization is not a fast-forward, stop and ask.

### Recovering accidental commits on main

This is a recovery path, not the normal workflow. If commits were accidentally
made on local `main`, stop and obtain authorization to preserve and publish them
on a work branch. Do not add more commits to `main`. With a clean worktree and
authorization, the existing helper can create and push that branch:

```sh
bash scripts/push-work-branch.sh chore/test-quality-automation
```

Use a fresh branch name for each change (prefer `issue/<number>-<short-slug>`
for Issue work). The script requires a clean worktree on `main`, fetches
`origin`, verifies that local `main` contains `origin/main` plus local commits,
and rejects existing local or remote branch names. It creates a branch and
pushes it with an upstream, without force pushing, committing files, resetting
local `main`, or creating a PR. If pushing fails, it retains the new local
branch so the error can be resolved and `git push` retried. For subsequent
commits on an existing work branch, use `git push` directly.

### Review checklist

1. Open a PR for the Issue and use `.github/PULL_REQUEST_TEMPLATE.md`.
2. Link the Issue with `Closes #<number>` only if the PR fully satisfies its
   acceptance criteria. Use `Refs #<number>` for partial work or when more
   follow-up is required.
3. Include a concise summary, acceptance criteria addressed, actual test/check
   results, documentation and GitHub planning impact, remaining limitations, and
   relevant UI screenshots or browser verification.
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

The `Review follow-up` workflow posts one `@copilot` comment per PR head commit
when a review requests changes or Deno CI fails. The comment asks for the
feedback to be addressed, relevant checks to be rerun, and another review to be
requested. It ignores stale commits and does not repeat a comment for the same
failure type and commit. This is a notification/request only: a comment posted
by GitHub Actions does not guarantee that a Copilot coding-agent session or a
new Copilot code review will start. Check the PR and repository's Copilot
settings and start either action manually if it does not.

### Opt-in Copilot PR automation

`Copilot PR lifecycle` extends the notification-only workflow for explicitly
opted-in work. Put `automation:auto-merge` on an Issue and assign Copilot. The
agent's PR must close that Issue, target the default branch, and originate in
this repository. Alternatively, label the PR after it links the Copilot-assigned
Issue. Human-authored, fork, unrelated, and unlabelled work is never
auto-merged. The lifecycle copies the Issue opt-in label to the PR.

The controller reconciles PR events, completed CI/agent runs, manual dispatches,
and every ten minutes (scheduled runs can be delayed by GitHub):

1. Wait for the agent to finish and a Copilot review of the **current head
   SHA**. Unresolved review threads or change requests trigger a
   user-authenticated `@copilot` repair request on the same branch.
2. After a clean review, dispatch a fresh `Deno CI` run for that exact head and
   base. Dispatch the workflow from the trusted **default branch**, never the
   mutable PR branch; its checkout is pinned to the reviewed head input. Verify
   the workflow run's own SHA equals the expected base SHA. Existing push/PR CI
   still runs as before, but is not a substitute for this post-review run.
3. Failed CI triggers a repair request. After a push, wait for a fresh review
   and run CI again. Each PR gets at most **three** automatic repair requests,
   at most one per head SHA. Transient CI failures may be verified and the same
   run retried without changing code.
4. Require both `Format, check, and test` and `MIDI E2E suite` to actually
   succeed; skipped, missing, cancelled, stale, and pre-review runs do not
   qualify. Require an up-to-date base, no conflicts, no unresolved threads, and
   all GitHub review/merge rules. Mark the draft ready, then squash-merge with
   an expected-head-SHA guard. Never bypass protection or manufacture an
   approval.

Copilot reviews normally use `COMMENTED`, not a human approval. For this opt-in
policy, a current Copilot review with no unresolved findings is the AI review
gate; required human approvals, if configured, still block merging. For the
native `ccr-overview-v2` format, require a green verdict heading; ambiguous or
cautionary summaries stop for a human even with no open threads.

Changes to `.github/`, agent/IDE instructions, `scripts/`, dependency manifests
and lockfiles, YAML configuration, Dockerfiles, or submodule configuration stop
automation, including renames out of those paths. Incomplete metadata and a
repair-limit breach also stop it. The controller applies
`automation:needs-human` and explains why. A maintainer must inspect these PRs.
Remove that label only after a deliberate human decision; the three-request
limit is not reset. To opt out entirely, remove `automation:auto-merge` from
both the Issue and PR.

#### One-time administrator setup

- Manually review and merge the setup PR; it is deliberately not auto-merged.
- Enable repository auto-merge and configure required checks on `main`:
  `Format, check, and test` and `MIDI E2E suite`, bound to GitHub Actions.
  Require the branch to be up to date, preserve review-thread resolution and
  existing approval requirements, and allow squash merging.
- Configure the Copilot code review ruleset to review drafts and every push.
  This repository-wide review rule also reviews non-opted-in PRs, but does not
  opt them into automatic repair or merge. The author's plan/policy must support
  Copilot review. For an already-open PR without a review, request its first
  Copilot review manually.
- Store `COPILOT_AUTOMATION_TOKEN` as an Actions repository secret. Use a
  repository-scoped fine-grained token owned by a write-access user with Copilot
  access: Contents, Pull requests, Issues, and Actions **read/write**, plus
  Metadata read. It posts feedback as that user rather than relying on
  `github-actions[bot]` mentions to start a Copilot session. Do not paste tokens
  into Issues, PRs, files, or logs; do not reuse a broad CLI credential.
- Set repository variable `COPILOT_AUTOMATION_ENABLED` to `true` only after the
  secret and review rule are configured. Missing credentials fail explicitly.
  Set it to `false` to stop the controller without changing branch protection.

The controller only checks out trusted default-branch code, never PR scripts. CI
checks out the reviewed SHA with read-only repository permissions and no
persisted checkout credentials. A privileged token is never given to PR code.
Dispatched workflow checks attach to the trusted default-branch SHA. The
controller's separate Actions token has `statuses: write` and `checks: write`:
it reports `Copilot post-review CI` on the **reviewed PR head** and mirrors each
verified required job's real result there under its original name and GitHub
Actions identity. Those checks start queued and succeed only after both actual
post-review jobs pass. Existing checks are never used as a substitute for those
jobs and no approval or passing result is manufactured.

The ordinary Copilot workflow-approval setting can stay enabled. Unapproved
ordinary PR runs do not execute; the controller instead runs trusted CI and
publishes its verified results to the required PR checks. It never approves
arbitrary PR-branch workflow code. See GitHub's
[workflow approval settings](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/configuring-agent-settings)
and
[automatic review configuration](https://docs.github.com/en/copilot/how-tos/copilot-on-github/set-up-copilot/configure-code-review).

This is not a guarantee that Copilot will act: entitlement, quota, token expiry,
service availability, or a stalled session can leave a PR waiting. Verify the
first opted-in PR end to end before relying on unattended operation. Errors are
visible in the `Copilot PR lifecycle` run; no failure is treated as approval.

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
- Keep actionable work in Issues, execution state/priority in the Project, and
  agreed goals in Milestones. The Project overview holds explicitly uncommitted
  candidates, not a second task checklist. The old roadmap/tasks/milestones
  pages only redirect readers to these sources.
- Keep product principles, specifications, technical references, and historical
  evidence in repository documents. See the
  [migration record](planning-migration.md) and
  [testing/legacy API reference](testing-and-legacy-apis.md). This workflow
  remains the source for GitHub Project and PR operating procedures.
- Review this document when Project fields, templates, labels, CI checks, or
  repository review policy change.
