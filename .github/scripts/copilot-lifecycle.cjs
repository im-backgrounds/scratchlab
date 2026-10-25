const OPT_IN = "automation:auto-merge";
const BLOCKED = "automation:needs-human";
const LIMIT = 3;
const CHECKS = ["Format, check, and test", "MIDI E2E suite"];
const isAgent = (login) =>
  ["Copilot", "copilot-swe-agent[bot]"].includes(login);
const isReviewer = (user) =>
  user?.type === "Bot" &&
  ["Copilot", "copilot-pull-request-reviewer[bot]"].includes(user.login);
const hasLabel = (item, name) =>
  item.labels.some((label) => label.name === name);

function sensitivePath(path) {
  return /(^|\/)(\.github|\.agents|\.vscode|scripts)\//i.test(path) ||
    /(^|\/)(AGENTS\.md|SKILL\.md|[^/]*\.(instructions|agent|prompt)\.md)$/i
      .test(path) ||
    /(^|\/)(deno\.(jsonc?|lock)|package(-lock)?\.json|[^/]*\.lockb?|\.npmrc|\.gitmodules|Dockerfile[^/]*|[^/]*\.ya?ml)$/i
      .test(path);
}

function ciTitle(pull) {
  return `Deno CI PR #${pull.number} @ ${pull.head.sha} base ${pull.base.sha}`;
}

function eligible(pull, issues, repository, defaultBranch) {
  const assigned = issues.filter((issue) =>
    issue.repository.nameWithOwner === repository &&
    issue.assignees.nodes.some((user) => isAgent(user.login))
  );
  return pull.state === "open" && pull.user.type === "Bot" &&
    isAgent(pull.user.login) && pull.head.repo?.full_name === repository &&
    pull.base.ref === defaultBranch && assigned.length > 0 &&
    (hasLabel(pull, OPT_IN) ||
      assigned.some((issue) =>
        issue.labels.nodes.some((label) => label.name === OPT_IN)
      ));
}

function decide(snapshot) {
  const {
    pull,
    issues,
    repository,
    defaultBranch,
    files,
    reviews,
    threads,
    comments,
    runs,
    automationLogin,
  } = snapshot;
  if (!eligible(pull, issues, repository, defaultBranch)) {
    return { action: "ignore" };
  }
  if (hasLabel(pull, BLOCKED)) return { action: "wait", reason: BLOCKED };
  if (
    snapshot.truncated || files.length !== pull.changed_files ||
    files.some((file) =>
      sensitivePath(file.filename) ||
      (file.previous_filename && sensitivePath(file.previous_filename))
    )
  ) {
    return {
      action: "stop",
      reason: "Sensitive changes or incomplete metadata.",
    };
  }
  if (snapshot.agentRunning) {
    return { action: "wait", reason: "Copilot is still working." };
  }
  const trusted = comments.filter((comment) =>
    comment.user.login === automationLogin
  );
  const fixes = trusted.filter((comment) =>
    /^<!-- scratchlab-auto:fix:[a-f0-9]{40} -->/m.test(comment.body ?? "")
  );
  function fix(reason) {
    const marker = `<!-- scratchlab-auto:fix:${pull.head.sha} -->`;
    if (fixes.some((comment) => comment.body.includes(marker))) {
      return {
        action: "wait",
        reason: "Already requested a fix for this SHA.",
      };
    }
    if (fixes.length >= LIMIT) {
      return {
        action: "stop",
        reason: `Automatic repair limit (${LIMIT}) reached.`,
      };
    }
    return { action: "fix", reason, marker, attempt: fixes.length + 1 };
  }
  if (snapshot.behind !== 0 || pull.mergeable === false) {
    return fix(
      "Update this branch from the base branch and resolve conflicts.",
    );
  }
  if (pull.mergeable === null) {
    return { action: "wait", reason: "GitHub is calculating mergeability." };
  }
  const currentReviews = reviews.filter((review) =>
    review.commit_id === pull.head.sha && isReviewer(review.user) &&
    ["COMMENTED", "APPROVED", "CHANGES_REQUESTED"].includes(review.state)
  ).sort((a, b) => Date.parse(b.submitted_at) - Date.parse(a.submitted_at));
  const review = currentReviews[0];
  if (!review) {
    return {
      action: "wait",
      reason: "Waiting for Copilot review of this SHA.",
    };
  }
  const latestByReviewer = new Map();
  for (const item of reviews) {
    if (["APPROVED", "CHANGES_REQUESTED"].includes(item.state)) {
      latestByReviewer.set(item.user.login, item);
    }
  }
  if (
    review.state === "CHANGES_REQUESTED" ||
    [...latestByReviewer.values()].some((item) =>
      item.state === "CHANGES_REQUESTED"
    ) || threads.some((thread) => !thread.isResolved)
  ) {
    return fix(
      "Read all review feedback and unresolved threads. Fix the findings, " +
        "resolve only threads whose findings are addressed, and push the fixes.",
    );
  }
  const run = runs.filter((item) =>
    item.event === "workflow_dispatch" &&
    item.head_sha === pull.head.sha && item.head_branch === pull.head.ref &&
    item.display_title === ciTitle(pull) &&
    Date.parse(item.created_at) >= Date.parse(review.submitted_at)
  ).sort((a, b) => b.id - a.id)[0];
  if (!run) return { action: "ci" };
  if (run.status !== "completed") {
    return { action: "wait", reason: `Waiting for CI: ${run.html_url}` };
  }
  if (run.conclusion !== "success") {
    return fix(
      `Inspect the failed post-review CI run ${run.html_url}, fix the cause, ` +
        "and push the fix. For a transient failure, verify it and rerun that run.",
    );
  }
  if (!snapshot.jobs) return { action: "jobs", runId: run.id };
  if (
    !CHECKS.every((name) =>
      snapshot.jobs.some((job) =>
        job.name === name && job.conclusion === "success"
      )
    ) ||
    snapshot.jobs.some((job) => job.conclusion !== "success")
  ) {
    return {
      action: "stop",
      reason: "CI did not run every expected job successfully.",
    };
  }
  if (snapshot.reviewDecision === "CHANGES_REQUESTED") {
    return fix("Address the blocking review and request a fresh review.");
  }
  if (snapshot.reviewDecision === "REVIEW_REQUIRED") {
    return {
      action: "wait",
      reason: "Required human approval is still missing.",
    };
  }
  if (pull.draft) return { action: "ready" };
  if (pull.mergeable_state !== "clean") {
    return {
      action: "wait",
      reason: `Merge is blocked: ${pull.mergeable_state}`,
    };
  }
  return { action: "merge" };
}

async function run({ github, context, core }) {
  const { owner, repo } = context.repo;
  const repository = `${owner}/${repo}`;
  const common = { owner, repo };
  const { data: repositoryData } = await github.rest.repos.get(common);
  const defaultBranch = repositoryData.default_branch;
  const { data: user } = await github.rest.users.getAuthenticated();
  const automationLogin = user.login;
  if (user.type !== "User") {
    throw new Error(
      "COPILOT_AUTOMATION_TOKEN must belong to a Copilot-enabled user.",
    );
  }
  const event = context.payload;
  const requestedNumber = event.inputs?.pr_number || event.pull_request?.number;
  if (
    requestedNumber !== undefined &&
    !/^[1-9]\d*$/.test(String(requestedNumber))
  ) {
    throw new Error("pr_number must be a positive integer.");
  }
  const candidates = requestedNumber
    ? [{ number: Number(requestedNumber) }]
    : await github.paginate(github.rest.pulls.list, {
      ...common,
      state: "open",
      base: defaultBranch,
      per_page: 100,
    });
  for (const candidate of candidates) {
    const number = candidate.number;
    const pullArgs = { ...common, pull_number: number };
    const { data: pull } = await github.rest.pulls.get(pullArgs);
    if (
      pull.state !== "open" || pull.user.type !== "Bot" ||
      !isAgent(pull.user.login) ||
      pull.head.repo?.full_name !== repository ||
      pull.base.ref !== defaultBranch
    ) continue;
    const metadata = await github.graphql(
      `query($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $number) {
            id
            reviewDecision
            closingIssuesReferences(first: 100) {
              pageInfo { hasNextPage }
              nodes {
                repository { nameWithOwner }
                assignees(first: 100) { nodes { login } pageInfo { hasNextPage } }
                labels(first: 100) { nodes { name } pageInfo { hasNextPage } }
              }
            }
            reviewThreads(first: 100) {
              pageInfo { hasNextPage }
              nodes { isResolved }
            }
          }
        }
      }`,
      { owner, repo, number },
    );
    const graph = metadata.repository.pullRequest;
    const issues = graph.closingIssuesReferences.nodes;
    if (!eligible(pull, issues, repository, defaultBranch)) continue;
    if (!hasLabel(pull, OPT_IN)) {
      await github.rest.issues.addLabels({
        ...common,
        issue_number: number,
        labels: [OPT_IN],
      });
    }
    const files = await github.paginate(github.rest.pulls.listFiles, {
      ...pullArgs,
      per_page: 100,
    });
    const reviews = await github.paginate(github.rest.pulls.listReviews, {
      ...pullArgs,
      per_page: 100,
    });
    const comments = await github.paginate(github.rest.issues.listComments, {
      ...common,
      issue_number: number,
      per_page: 100,
    });
    const runs = await github.paginate(github.rest.actions.listWorkflowRuns, {
      ...common,
      workflow_id: "deno-ci.yml",
      branch: pull.head.ref,
      event: "workflow_dispatch",
      per_page: 100,
    });
    const branchRuns = await github.paginate(
      github.rest.actions.listWorkflowRunsForRepo,
      { ...common, branch: pull.head.ref, per_page: 100 },
    );
    const { data: comparison } = await github.rest.repos
      .compareCommitsWithBasehead({
        ...common,
        basehead: `${pull.base.sha}...${pull.head.sha}`,
        per_page: 1,
      });
    const snapshot = {
      pull,
      issues,
      repository,
      defaultBranch,
      files,
      reviews,
      threads: graph.reviewThreads.nodes,
      comments,
      runs,
      automationLogin,
      behind: comparison.behind_by,
      reviewDecision: graph.reviewDecision,
      agentRunning: branchRuns.some((item) =>
        item.path === "dynamic/copilot-swe-agent/copilot" &&
        item.status !== "completed"
      ),
      truncated: graph.closingIssuesReferences.pageInfo.hasNextPage ||
        graph.reviewThreads.pageInfo.hasNextPage ||
        issues.some((issue) =>
          issue.assignees.pageInfo.hasNextPage ||
          issue.labels.pageInfo.hasNextPage
        ),
    };
    let decision = decide(snapshot);
    if (decision.action === "jobs") {
      snapshot.jobs = await github.paginate(
        github.rest.actions.listJobsForWorkflowRun,
        { ...common, run_id: decision.runId, filter: "latest", per_page: 100 },
      );
      decision = decide(snapshot);
    }
    core.info(`#${number}: ${decision.action} ${decision.reason ?? ""}`);
    if (["ignore", "wait"].includes(decision.action)) continue;
    const { data: fresh } = await github.rest.pulls.get(pullArgs);
    if (
      fresh.state !== "open" || fresh.head.sha !== pull.head.sha ||
      fresh.base.sha !== pull.base.sha ||
      hasLabel(fresh, BLOCKED) || !hasLabel(fresh, OPT_IN)
    ) {
      core.info(
        `#${number}: State changed; waiting for the next reconciliation.`,
      );
      continue;
    }
    if (decision.action === "stop") {
      await github.rest.issues.addLabels({
        ...common,
        issue_number: number,
        labels: [BLOCKED],
      });
      await github.rest.issues.createComment({
        ...common,
        issue_number: number,
        body:
          `Automatic processing stopped: ${decision.reason}\nHuman review is required. No protection rules were bypassed.`,
      });
    } else if (decision.action === "fix") {
      await github.rest.issues.createComment({
        ...common,
        issue_number: number,
        body: [
          decision.marker,
          `@copilot Automatic repair ${decision.attempt}/${LIMIT} for ${pull.head.sha}.`,
          decision.reason,
          "Keep the fix on this PR branch, run relevant local checks, and request a fresh Copilot review after pushing.",
          "Do not merge or close this PR. The automation checks review and CI again before merging.",
        ].join("\n\n"),
      });
    } else if (decision.action === "ci") {
      await github.rest.actions.createWorkflowDispatch({
        ...common,
        workflow_id: "deno-ci.yml",
        ref: pull.head.ref,
        inputs: {
          pr_number: String(number),
          head_sha: pull.head.sha,
          base_sha: pull.base.sha,
        },
      });
    } else if (decision.action === "ready") {
      await github.graphql(
        `mutation($id: ID!) {
          markPullRequestReadyForReview(input: {pullRequestId: $id}) {
            pullRequest { id }
          }
        }`,
        { id: graph.id },
      );
    } else if (decision.action === "merge") {
      const { data: result } = await github.rest.pulls.merge({
        ...pullArgs,
        sha: pull.head.sha,
        merge_method: "squash",
      });
      if (!result.merged) throw new Error(`PR #${number}: ${result.message}`);
      core.info(`Merged #${number}: ${result.sha}`);
    }
  }
}

module.exports = { ciTitle, decide, eligible, run, sensitivePath };
