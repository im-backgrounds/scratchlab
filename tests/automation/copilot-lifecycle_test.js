import assert from "node:assert/strict";
import {
  ciTitle,
  decide,
  eligible,
  run,
  sensitivePath,
} from "../../.github/scripts/copilot-lifecycle.cjs";

const sha = "a".repeat(40);
const base = "b".repeat(40);
const time = "2026-10-25T12:00:00Z";
const label = { name: "automation:auto-merge" };

function fixture() {
  const pull = {
    number: 12,
    state: "open",
    user: { login: "Copilot", type: "Bot" },
    head: { sha, ref: "copilot/issue-1", repo: { full_name: "owner/repo" } },
    base: { sha: base, ref: "main" },
    labels: [label],
    changed_files: 1,
    mergeable: true,
    mergeable_state: "clean",
    draft: false,
  };
  return {
    pull,
    repository: "owner/repo",
    defaultBranch: "main",
    issues: [{
      repository: { nameWithOwner: "owner/repo" },
      assignees: {
        nodes: [{ login: "Copilot" }],
        pageInfo: { hasNextPage: false },
      },
      labels: { nodes: [], pageInfo: { hasNextPage: false } },
    }],
    files: [{ filename: "src/app.js" }],
    reviews: [{
      id: 1,
      user: { login: "Copilot", type: "Bot" },
      commit_id: sha,
      state: "COMMENTED",
      submitted_at: time,
    }],
    threads: [],
    comments: [],
    runs: [{
      id: 20,
      event: "workflow_dispatch",
      head_sha: sha,
      head_branch: pull.head.ref,
      display_title: ciTitle(pull),
      created_at: "2026-10-25T12:01:00Z",
      status: "completed",
      conclusion: "success",
      html_url: "https://github.com/owner/repo/actions/runs/20",
    }],
    jobs: [
      { name: "Format, check, and test", conclusion: "success" },
      { name: "MIDI E2E suite", conclusion: "success" },
    ],
    automationLogin: "maintainer",
    behind: 0,
    agentRunning: false,
    truncated: false,
    reviewDecision: null,
  };
}

Deno.test("only same-repository issue-assigned opted-in Copilot PRs qualify", () => {
  const check = (data) =>
    eligible(data.pull, data.issues, data.repository, data.defaultBranch);
  assert.equal(check(fixture()), true);
  for (
    const mutate of [
      (s) => s.pull.user.login = "other-bot",
      (s) => s.pull.user.type = "User",
      (s) => s.pull.head.repo = null,
      (s) => s.pull.head.repo.full_name = "fork/repo",
      (s) => s.pull.base.ref = "release",
      (s) => s.pull.state = "closed",
      (s) => s.pull.labels = [],
      (s) => s.issues = [],
      (s) => s.issues[0].assignees.nodes = [],
      (s) => s.issues[0].repository.nameWithOwner = "another/repo",
    ]
  ) {
    const data = fixture();
    mutate(data);
    assert.equal(check(data), false);
    assert.equal(decide(data).action, "ignore");
  }
  const data = fixture();
  data.pull.labels = [];
  data.issues[0].labels.nodes = [label];
  assert.equal(check(data), true);
});

Deno.test("sensitive configuration and renamed paths stop automation", () => {
  for (
    const path of [
      ".github/workflows/ci.yml",
      ".github/scripts/controller.cjs",
      "scripts/build.sh",
      "AGENTS.md",
      "nested/AGENTS.md",
      "deno.json",
      "tests/e2e/deno.lock",
      ".gitmodules",
      "package-lock.json",
      "Dockerfile",
      ".vscode/settings.json",
    ]
  ) {
    assert.equal(sensitivePath(path), true, path);
    const data = fixture();
    data.files = [{ filename: "src/app.js", previous_filename: path }];
    assert.equal(decide(data).action, "stop", path);
  }
  assert.equal(sensitivePath("src/clock.js"), false);
  assert.equal(sensitivePath("docs/github-workflow.md"), false);
});

Deno.test("missing or truncated metadata cannot merge", () => {
  const data = fixture();
  data.truncated = true;
  assert.equal(decide(data).action, "stop");
  data.truncated = false;
  data.pull.changed_files = 2;
  assert.equal(decide(data).action, "stop");
});

Deno.test("current-head Copilot review is required before dispatching CI", () => {
  for (
    const mutate of [
      (s) => s.reviews = [],
      (s) => s.reviews[0].commit_id = base,
      (s) => s.reviews[0].user = { login: "human", type: "User" },
      (s) => s.reviews[0].state = "DISMISSED",
      (s) => s.reviews[0].state = "PENDING",
    ]
  ) {
    const data = fixture();
    data.runs = [];
    mutate(data);
    assert.equal(decide(data).action, "wait");
  }
  const data = fixture();
  data.runs = [];
  assert.equal(decide(data).action, "ci");
});

Deno.test("unresolved reviews trigger repair, not CI or merge", () => {
  const data = fixture();
  data.threads = [{ isResolved: false }];
  assert.equal(decide(data).action, "fix");
  data.threads[0].isResolved = true;
  assert.equal(decide(data).action, "merge");
  data.reviews.push({
    id: 2,
    user: { login: "human", type: "User" },
    state: "CHANGES_REQUESTED",
    commit_id: base,
    submitted_at: time,
  });
  assert.equal(decide(data).action, "fix");
  data.reviews.push({
    ...data.reviews[1],
    id: 3,
    state: "APPROVED",
  });
  assert.equal(decide(data).action, "merge");
});

Deno.test("repair limit is three across commits and duplicate events do not retry", () => {
  const data = fixture();
  data.threads = [{ isResolved: false }];
  const decision = decide(data);
  assert.equal(decision.attempt, 1);
  data.comments = [{
    user: { login: "maintainer" },
    body: decision.marker,
  }];
  assert.equal(decide(data).action, "wait");
  data.comments[0].user.login = "attacker";
  assert.equal(decide(data).action, "fix");
  data.comments = ["c", "d", "e"].map((letter) => ({
    user: { login: "maintainer" },
    body: `<!-- scratchlab-auto:fix:${letter.repeat(40)} -->`,
  }));
  assert.equal(decide(data).action, "stop");
});

Deno.test("active agent, blocked PRs and unknown mergeability wait", () => {
  const data = fixture();
  data.agentRunning = true;
  assert.equal(decide(data).action, "wait");
  data.agentRunning = false;
  data.pull.mergeable = null;
  assert.equal(decide(data).action, "wait");
  data.pull.mergeable = true;
  data.pull.labels.push({ name: "automation:needs-human" });
  assert.equal(decide(data).action, "wait");
});

Deno.test("a stale base or merge conflict requires repair and fresh review", () => {
  const data = fixture();
  data.behind = 1;
  assert.equal(decide(data).action, "fix");
  data.behind = 0;
  data.pull.mergeable = false;
  assert.equal(decide(data).action, "fix");
});

Deno.test("CI must match head, base, branch, dispatch event and review time", () => {
  for (
    const mutate of [
      (s) => s.runs[0].head_sha = base,
      (s) => s.runs[0].head_branch = "main",
      (s) => s.runs[0].event = "pull_request",
      (s) => s.runs[0].display_title = "other CI",
      (s) => s.pull.base.sha = "c".repeat(40),
      (s) => s.runs[0].created_at = "2026-10-25T11:59:00Z",
    ]
  ) {
    const data = fixture();
    mutate(data);
    assert.equal(decide(data).action, "ci");
  }
  const data = fixture();
  data.runs[0].status = "in_progress";
  assert.equal(decide(data).action, "wait");
  data.runs[0].status = "completed";
  data.runs[0].conclusion = "failure";
  assert.equal(decide(data).action, "fix");
});

Deno.test("latest CI attempt wins and all expected jobs must really pass", () => {
  const data = fixture();
  data.runs.push({ ...data.runs[0], id: 21, conclusion: "failure" });
  assert.equal(decide(data).action, "fix");
  data.runs.pop();
  delete data.jobs;
  assert.deepEqual(decide(data), { action: "jobs", runId: 20 });
  data.jobs = [{ name: "Format, check, and test", conclusion: "success" }];
  assert.equal(decide(data).action, "stop");
  data.jobs = fixture().jobs;
  data.jobs[1].conclusion = "skipped";
  assert.equal(decide(data).action, "stop");
});

Deno.test("ready and merge never override review or branch protections", () => {
  const data = fixture();
  data.pull.draft = true;
  assert.equal(decide(data).action, "ready");
  data.reviewDecision = "REVIEW_REQUIRED";
  assert.equal(decide(data).action, "wait");
  data.reviewDecision = "CHANGES_REQUESTED";
  assert.equal(decide(data).action, "fix");
  data.reviewDecision = null;
  data.pull.draft = false;
  data.pull.mergeable_state = "blocked";
  assert.equal(decide(data).action, "wait");
  data.pull.mergeable_state = "clean";
  assert.equal(decide(data).action, "merge");
});

function mockGithub(data, fresh = data.pull) {
  const calls = [];
  const endpoint = (name, result) => {
    const fn = (args) => {
      calls.push({ name, args });
      return { data: typeof result === "function" ? result() : result };
    };
    fn.endpointName = name;
    return fn;
  };
  let gets = 0;
  const rest = {
    repos: {
      get: endpoint("repository", { default_branch: "main" }),
      compareCommitsWithBasehead: endpoint("compare", {
        behind_by: data.behind,
      }),
    },
    users: {
      getAuthenticated: endpoint("user", { login: "maintainer", type: "User" }),
    },
    pulls: {
      get: endpoint("pull", () => ++gets === 1 ? data.pull : fresh),
      listFiles: endpoint("files", data.files),
      listReviews: endpoint("reviews", data.reviews),
      merge: endpoint("merge", { merged: true, sha }),
    },
    issues: {
      listComments: endpoint("comments", data.comments),
      addLabels: endpoint("labels", {}),
      createComment: endpoint("comment", {}),
    },
    actions: {
      listWorkflowRuns: endpoint("runs", data.runs),
      listWorkflowRunsForRepo: endpoint("branchRuns", []),
      listJobsForWorkflowRun: endpoint("jobs", data.jobs),
      createWorkflowDispatch: endpoint("dispatch", {}),
    },
  };
  const github = {
    rest,
    paginate: async (method, args) => (await method(args)).data,
    graphql: (_query, args) => {
      calls.push({ name: "graphql", args });
      return {
        repository: {
          pullRequest: {
            id: "PR_ID",
            reviewDecision: data.reviewDecision,
            closingIssuesReferences: {
              nodes: data.issues,
              pageInfo: { hasNextPage: false },
            },
            reviewThreads: {
              nodes: data.threads,
              pageInfo: { hasNextPage: false },
            },
          },
        },
      };
    },
  };
  return { github, calls };
}

async function reconcile(data, fresh) {
  const { github, calls } = mockGithub(data, fresh);
  await run({
    github,
    context: {
      repo: { owner: "owner", repo: "repo" },
      payload: { inputs: { pr_number: "12" } },
    },
    core: { info() {} },
  });
  return calls;
}

Deno.test("reconciliation dispatches exact reviewed head and base", async () => {
  const data = fixture();
  data.runs = [];
  const calls = await reconcile(data);
  assert.deepEqual(calls.find((call) => call.name === "dispatch").args, {
    owner: "owner",
    repo: "repo",
    workflow_id: "deno-ci.yml",
    ref: data.pull.head.ref,
    inputs: { pr_number: "12", head_sha: sha, base_sha: base },
  });
  assert.equal(calls.some((call) => call.name === "merge"), false);
});

Deno.test("reconciliation merges with squash and an expected-SHA guard", async () => {
  const calls = await reconcile(fixture());
  assert.deepEqual(calls.find((call) => call.name === "merge").args, {
    owner: "owner",
    repo: "repo",
    pull_number: 12,
    sha,
    merge_method: "squash",
  });
});

Deno.test("head, base or opt-in changes before mutation prevent merging", async () => {
  for (
    const mutate of [
      (p) => p.head.sha = base,
      (p) => p.base.sha = sha,
      (p) => p.state = "closed",
      (p) => p.labels = [],
      (p) => p.labels.push({ name: "automation:needs-human" }),
    ]
  ) {
    const data = fixture();
    const fresh = structuredClone(data.pull);
    mutate(fresh);
    const calls = await reconcile(data, fresh);
    assert.equal(calls.some((call) => call.name === "merge"), false);
    assert.equal(calls.some((call) => call.name === "dispatch"), false);
  }
});

Deno.test("repair comments mention Copilot once and sensitive PRs get a stop label", async () => {
  const data = fixture();
  data.threads = [{ isResolved: false }];
  let calls = await reconcile(data);
  const comment = calls.find((call) => call.name === "comment");
  assert.match(comment.args.body, /@copilot Automatic repair 1\/3/);
  data.comments = [{ user: { login: "maintainer" }, body: comment.args.body }];
  calls = await reconcile(data);
  assert.equal(calls.some((call) => call.name === "comment"), false);
  data.files = [{ filename: ".github/workflows/ci.yml" }];
  calls = await reconcile(data);
  assert.deepEqual(calls.find((call) => call.name === "labels").args.labels, [
    "automation:needs-human",
  ]);
  assert.equal(calls.some((call) => call.name === "merge"), false);
});

Deno.test("ready transition does not merge a draft in the same reconciliation", async () => {
  const data = fixture();
  data.pull.draft = true;
  const calls = await reconcile(data);
  assert.equal(
    calls.some((call) => call.name === "graphql" && call.args.id === "PR_ID"),
    true,
  );
  assert.equal(calls.some((call) => call.name === "merge"), false);
});

Deno.test("API errors propagate instead of being treated as success", async () => {
  const data = fixture();
  const { github } = mockGithub(data);
  github.rest.pulls.merge = () => {
    throw new Error("merge denied");
  };
  await assert.rejects(
    run({
      github,
      context: {
        repo: { owner: "owner", repo: "repo" },
        payload: { inputs: { pr_number: "12" } },
      },
      core: { info() {} },
    }),
    /merge denied/,
  );
});

Deno.test("a bot token is rejected before PR mutation", async () => {
  const { github, calls } = mockGithub(fixture());
  github.rest.users.getAuthenticated = () => ({
    data: { login: "github-actions[bot]", type: "Bot" },
  });
  await assert.rejects(
    run({
      github,
      context: { repo: { owner: "owner", repo: "repo" }, payload: {} },
      core: { info() {} },
    }),
    /must belong to a Copilot-enabled user/,
  );
  assert.equal(calls.some((call) => call.name === "merge"), false);
});
