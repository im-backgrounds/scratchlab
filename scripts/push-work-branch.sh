#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

if [[ $# -ne 1 ]]; then
  printf 'Usage: bash scripts/push-work-branch.sh <new-branch-name>\n' >&2
  exit 1
fi

branch=$1
git check-ref-format --branch "$branch" >/dev/null ||
  fail "Invalid branch name: $branch"
[[ "$branch" != -* && "$branch" != "main" && "$branch" != "HEAD" ]] ||
  fail "Choose a new work branch, not main or HEAD."
[[ "$(git branch --show-current)" == "main" ]] ||
  fail "Run this script from main."
[[ -z "$(git status --porcelain)" ]] ||
  fail "Commit or stash pending changes before running this script."
if git show-ref --verify --quiet "refs/heads/$branch"; then
  fail "Local branch already exists: $branch"
fi

git fetch origin
git rev-parse --verify refs/remotes/origin/main >/dev/null
git merge-base --is-ancestor origin/main HEAD ||
  fail "Local main diverges from origin/main. Resolve it before pushing."
[[ "$(git rev-list --count origin/main..HEAD)" -gt 0 ]] ||
  fail "There are no local commits to push."
remote_branch=$(git ls-remote --heads origin "refs/heads/$branch")
[[ -z "$remote_branch" ]] ||
  fail "Remote branch already exists: $branch"

git switch -c "$branch"
if ! git push --set-upstream origin "HEAD:refs/heads/$branch"; then
  fail "Push failed. The local branch '$branch' is retained; inspect the error and retry git push."
fi
printf 'Pushed work branch: %s\nCreate a pull request to merge into main.\n' "$branch"
