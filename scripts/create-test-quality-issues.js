const owner = "im-backgrounds";
const repo = "scratchlab";
const milestoneTitle = "Test Quality Improvement";

const issuePlan = [
  {
    key: "infrastructure",
    title: "test(epic): Testing Infrastructure",
    body: `## Goal

テスト基盤の安定化

### Done Definition

- [ ] Unit Test 全成功
- [ ] Coverage取得可能
- [ ] CIで確認可能
- [ ] README更新`,
    labels: ["epic", "type:test", "priority:p1", "area:testing"],
    children: [
      {
        key: "timezone-test",
        title: "test(midi): fix timezone dependent diagnostic log test",
        body: `## Background

調査時点のユニットテストは427 passed / 1 failedでした。MIDI Diagnostic Logのテストが、ローカル時刻表示実装に対してUTC固定の期待値を持ち、JSTで失敗します。

## Acceptance Criteria

- [ ] UTC環境で成功
- [ ] JST環境で成功
- [ ] ローカル時刻表示仕様維持
- [ ] deno test全件成功

## Estimate

S`,
        labels: ["type:test", "priority:p1", "area:midi", "area:testing"],
      },
      {
        key: "coverage-report",
        title: "test(coverage): publish scoped coverage report",
        body: `## Background

Coverage運用がなく、測定値の対象範囲やCI上の可視性が明確ではありません。

## Acceptance Criteria

- [ ] Coverage生成スクリプト作成
- [ ] HTMLレポート出力
- [ ] CI統合
- [ ] Coverage対象範囲を明確化

## Estimate

M`,
        labels: ["type:test", "priority:p2", "area:coverage"],
      },
      {
        key: "testing-docs",
        title: "docs(testing): document test and coverage workflow",
        body: `## Background

READMEには標準テスト・チェックとMIDI E2Eへの案内があります。Coverage運用を整備した後、Coverage手順を含めて開発者向けテスト手順を同期します。

## Acceptance Criteria

- [ ] README更新
- [ ] Coverage手順記載
- [ ] E2E手順記載

## Estimate

S`,
        labels: ["type:docs", "priority:p3", "area:testing"],
      },
    ],
  },
  {
    key: "bpm-challenge",
    title: "test(epic): BPM Challenge Quality",
    body: `## Goal

BPM Challengeの回帰防止

### Done Definition

- [ ] Success Path テスト済み
- [ ] Failure Path テスト済み
- [ ] Interrupted Path テスト済み
- [ ] Scoringテスト済み`,
    labels: ["epic", "type:test", "priority:p1", "area:bpm-challenge"],
    children: [
      {
        key: "challenge-interruption",
        title: "test(bpm-challenge): add interrupted challenge scenarios",
        body: `## Background

BPM Challengeは成功ケース中心のテスト構成です。中断・MIDI切断後に状態や進捗が不整合にならないことを回帰テストで確認します。

## Acceptance Criteria

- [ ] Challenge中断
- [ ] MIDI切断
- [ ] 再挑戦
- [ ] 状態復帰確認

## Estimate

M`,
        labels: [
          "type:test",
          "priority:p1",
          "area:bpm-challenge",
          "area:midi",
          "test:e2e",
        ],
      },
      {
        key: "challenge-failures",
        title: "test(bpm-challenge): add failure and low-score scenarios",
        body: `## Background

既存のChallengeテストを拡張し、低スコアや入力の不足・誤りが正しく不合格となることを実アプリ経路で確認します。

## Acceptance Criteria

- [ ] 低スコア
- [ ] BPMずれ
- [ ] フェーダーミス
- [ ] スクラッチ不足

## Estimate

M`,
        labels: [
          "type:test",
          "priority:p1",
          "area:bpm-challenge",
          "test:e2e",
        ],
      },
      {
        key: "challenge-flow",
        title: "test(e2e): automate BPM Challenge regression flow",
        body: `## Background

BPM ChallengeのE2Eフローを維持し、Challenge開始から結果表示までのウォームアップ・記録・採点の境界を検証します。

## Acceptance Criteria

以下フローをE2E化

- [ ] Challenge開始
- [ ] 1周目再生
- [ ] 2周目記録開始
- [ ] 3周目記録終了
- [ ] 採点
- [ ] 結果表示

## Estimate

L`,
        labels: [
          "type:test",
          "priority:p1",
          "area:bpm-challenge",
          "test:e2e",
        ],
      },
    ],
  },
  {
    key: "midi-settings",
    title: "test(epic): MIDI Settings Quality",
    body: `## Goal

MIDI設定画面の品質保証

### Done Definition

- [ ] 正常系確認
- [ ] 異常系確認
- [ ] 復旧系確認`,
    labels: ["epic", "type:test", "priority:p2", "area:midi"],
    children: [
      {
        key: "midi-settings-errors",
        title: "test(midi-settings): cover page error states",
        body: `## Background

MIDI設定画面の異常状態を、実機に依存せず再現可能なテストで確認します。

## Acceptance Criteria

- [ ] Web MIDI未対応
- [ ] デバイス未接続
- [ ] アクセス拒否
- [ ] 設定未作成

## Estimate

M`,
        labels: ["type:test", "priority:p2", "area:midi", "test:e2e"],
      },
      {
        key: "midi-settings-recovery",
        title: "test(midi-settings): cover recovery scenarios",
        body: `## Background

MIDI設定のエラー状態から、接続・設定・入力が再開できることを確認します。

## Acceptance Criteria

- [ ] 再接続
- [ ] 設定復元
- [ ] Learn再実行
- [ ] 入力再開

## Estimate

M`,
        labels: ["type:test", "priority:p2", "area:midi", "test:e2e"],
      },
    ],
  },
];

function parseArguments(args) {
  let apply = false;
  const selectedIssues = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--apply") {
      apply = true;
    } else if (arg === "--select") {
      const selection = args[index + 1];
      if (!selection) {
        throw new Error("--select requires a key=issue-number value");
      }
      index += 1;
      const [key, issueNumber, ...extra] = selection.split("=");
      if (!key || !/^\d+$/.test(issueNumber ?? "") || extra.length > 0) {
        throw new Error(`Invalid --select value: ${selection}`);
      }
      selectedIssues.set(key, Number(issueNumber));
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: deno run --allow-read=.github/labels.json --allow-run=gh scripts/create-test-quality-issues.js [--apply] [--select key=issue-number]",
      );
      Deno.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { apply, selectedIssues };
}

async function runGh(args, input) {
  const child = new Deno.Command("gh", {
    args,
    stdin: input === undefined ? "null" : "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const outputPromise = child.output();
  if (input !== undefined) {
    const writer = child.stdin.getWriter();
    await writer.write(new TextEncoder().encode(input));
    await writer.close();
  }
  const output = await outputPromise;
  const stdout = new TextDecoder().decode(output.stdout).trim();
  const stderr = new TextDecoder().decode(output.stderr).trim();
  if (!output.success) {
    throw new Error(stderr || stdout || `gh exited with code ${output.code}`);
  }
  return stdout;
}

async function api(path, { method, body } = {}) {
  const args = ["api"];
  if (method) args.push("--method", method);
  args.push(path);
  if (body !== undefined) args.push("--input", "-");
  const output = await runGh(
    args,
    body === undefined ? undefined : JSON.stringify(body),
  );
  return output ? JSON.parse(output) : null;
}

async function listAll(path) {
  const output = await runGh(["api", "--paginate", "--slurp", path]);
  return JSON.parse(output).flat();
}

function flattenPlan() {
  return issuePlan.flatMap((parent) => [
    { ...parent, parentKey: null },
    ...parent.children.map((child) => ({ ...child, parentKey: parent.key })),
  ]);
}

function getDefinitions(labelConfig, names) {
  const byName = new Map(
    labelConfig.labels.map((label) => [label.name, label]),
  );
  return [...new Set(names)].map((name) => {
    const definition = byName.get(name);
    if (!definition) {
      throw new Error(
        `Label "${name}" is missing from .github/labels.json; add its definition before running this script.`,
      );
    }
    return definition;
  });
}

function labelsForUpdate(existing, plannedLabels) {
  const plannedTypes = plannedLabels.filter((label) =>
    label.startsWith("type:")
  );
  if (plannedTypes.length !== 1) {
    throw new Error(
      `Each planned issue must have exactly one type label; found ${plannedTypes.length}.`,
    );
  }
  const preserved = existing.labels
    .map((label) => label.name)
    .filter((label) => !label.startsWith("type:"));
  return [...new Set([...preserved, ...plannedLabels])];
}

function resolveExistingIssues(plan, issues, selectedIssues) {
  const resolved = new Map();
  const planKeys = new Set(plan.map((item) => item.key));
  for (const key of selectedIssues.keys()) {
    if (!planKeys.has(key)) {
      throw new Error(`Unknown issue key in --select: ${key}`);
    }
  }

  for (const item of plan) {
    const matches = issues.filter((issue) => issue.title === item.title);
    const selectedNumber = selectedIssues.get(item.key);
    if (selectedNumber !== undefined) {
      const selected = matches.find((issue) => issue.number === selectedNumber);
      if (!selected) {
        throw new Error(
          `Issue #${selectedNumber} does not match planned title "${item.title}" for key "${item.key}".`,
        );
      }
      resolved.set(item.key, selected);
    } else if (matches.length > 1) {
      const candidates = matches.map((issue) => `#${issue.number}`).join(", ");
      throw new Error(
        `Ambiguous duplicate title "${item.title}" (${candidates}). Select one with --select ${item.key}=<number>. No changes made.`,
      );
    } else if (matches.length === 1) {
      resolved.set(item.key, matches[0]);
    }
  }
  return resolved;
}

function logPlan(plan, resolved, milestone, labels) {
  console.log(
    `${
      milestone
        ? `Use milestone "${milestone.title}" (#${milestone.number})`
        : `Create milestone "${milestoneTitle}"`
    }`,
  );
  for (const label of labels) {
    console.log(`Ensure label "${label.name}" exists`);
  }
  for (const item of plan) {
    const existing = resolved.get(item.key);
    const action = existing ? `Reuse #${existing.number}` : "Create";
    const parent = item.parentKey ? ` under ${item.parentKey}` : "";
    console.log(`${action}${parent}: ${item.title}`);
  }
  console.log(
    "Ensure all planned child issues are linked through GitHub Sub-Issues.",
  );
}

async function ensureLabel(label, currentLabels) {
  if (currentLabels.has(label.name)) return;
  await api(`repos/${owner}/${repo}/labels`, {
    method: "POST",
    body: {
      name: label.name,
      color: label.color,
      description: label.description,
    },
  });
  currentLabels.add(label.name);
}

async function ensureSubIssue(parent, child) {
  const linkedIssues = await listAll(
    `repos/${owner}/${repo}/issues/${parent.number}/sub_issues?per_page=100`,
  );
  if (linkedIssues.some((issue) => issue.number === child.number)) return;
  await api(`repos/${owner}/${repo}/issues/${parent.number}/sub_issues`, {
    method: "POST",
    body: { sub_issue_id: child.id },
  });
}

async function main() {
  const { apply, selectedIssues } = parseArguments(Deno.args);
  await runGh(["auth", "status", "--hostname", "github.com"]);

  const labelConfig = JSON.parse(
    await Deno.readTextFile(new URL("../.github/labels.json", import.meta.url)),
  );
  const plan = flattenPlan();
  for (const item of plan) {
    if (item.labels.filter((label) => label.startsWith("type:")).length !== 1) {
      throw new Error(
        `Issue "${item.title}" must have exactly one type label before any GitHub changes are made.`,
      );
    }
  }
  const labelsNeeded = getDefinitions(
    labelConfig,
    plan.flatMap((item) => item.labels),
  );
  const [issues, currentLabels, milestones] = await Promise.all([
    listAll(`repos/${owner}/${repo}/issues?state=all&per_page=100`),
    listAll(`repos/${owner}/${repo}/labels?per_page=100`),
    listAll(`repos/${owner}/${repo}/milestones?state=all&per_page=100`),
  ]);
  const repositoryIssues = issues.filter((issue) => !issue.pull_request);
  const resolved = resolveExistingIssues(
    plan,
    repositoryIssues,
    selectedIssues,
  );
  for (const item of plan) {
    const existing = resolved.get(item.key);
    if (existing?.state === "closed") {
      throw new Error(
        `Planned issue "${item.title}" resolves to closed issue #${existing.number}. No changes made.`,
      );
    }
  }
  const matchingMilestones = milestones.filter(
    (milestone) => milestone.title === milestoneTitle,
  );
  const closedMilestones = matchingMilestones.filter(
    (milestone) => milestone.state !== "open",
  );
  if (closedMilestones.length > 0) {
    throw new Error(
      `A closed milestone named "${milestoneTitle}" already exists (#${
        closedMilestones.map((milestone) => milestone.number).join(", ")
      }). Reopen or rename it before running this script.`,
    );
  }
  const existingMilestones = matchingMilestones.filter(
    (milestone) =>
      milestone.title === milestoneTitle && milestone.state === "open",
  );
  if (existingMilestones.length > 1) {
    throw new Error(
      `Multiple open milestones named "${milestoneTitle}" exist. Resolve them before running this script.`,
    );
  }

  const missingLabels = labelsNeeded.filter(
    (label) => !currentLabels.some((current) => current.name === label.name),
  );
  logPlan(plan, resolved, existingMilestones[0], missingLabels);
  if (!apply) {
    console.log(
      "\nDry run only. Pass --apply to create or update GitHub resources.",
    );
    return;
  }

  const currentLabelNames = new Set(
    currentLabels.map((current) => current.name),
  );
  for (const label of missingLabels) {
    await ensureLabel(label, currentLabelNames);
  }
  const milestone = existingMilestones[0] ?? await api(
    `repos/${owner}/${repo}/milestones`,
    {
      method: "POST",
      body: { title: milestoneTitle, state: "open" },
    },
  );

  for (const item of plan) {
    const existing = resolved.get(item.key);
    const parent = item.parentKey ? resolved.get(item.parentKey) : undefined;
    if (item.parentKey && !parent) {
      throw new Error(`Parent "${item.parentKey}" was not resolved.`);
    }
    if (parent?.state === "closed") {
      throw new Error(
        `Parent issue #${parent.number} is closed; refusing to add child issues.`,
      );
    }

    const issue = existing
      ? await api(`repos/${owner}/${repo}/issues/${existing.number}`, {
        method: "PATCH",
        body: {
          labels: labelsForUpdate(existing, item.labels),
          milestone: milestone.number,
        },
      })
      : await api(`repos/${owner}/${repo}/issues`, {
        method: "POST",
        body: {
          title: item.title,
          body: item.body,
          labels: item.labels,
          milestone: milestone.number,
        },
      });

    resolved.set(item.key, issue);
    console.log(
      `${existing ? "Updated" : "Created"} #${issue.number}: ${issue.title}`,
    );
    if (parent) {
      await ensureSubIssue(parent, issue);
      console.log(
        `Linked #${issue.number} as a sub-issue of #${parent.number}`,
      );
    }
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    Deno.exit(1);
  }
}
