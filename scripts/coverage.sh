#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

deno test --clean --coverage=coverage \
  --allow-read=tests/ui/snapshots --ignore=tests/e2e

NO_COLOR=1 deno coverage --include='^file:.*/src/' coverage \
  > coverage/summary.txt
deno coverage --html --include='^file:.*/src/' coverage

cat coverage/summary.txt
printf '\nHTML report: coverage/html/index.html\n'
