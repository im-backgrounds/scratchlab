# GitHub Project 運用

ScratchLabの作業は **ScratchLab Development** Projectで管理します。
Issueの要件・完了条件はIssueを正とし、Projectは進行状況と優先度の管理に使います。
Project項目とIssueラベルは自動同期されないため、優先度を変更するときは両方を更新してください。

## ステータス

現在のProjectで使用するStatusは次のとおりです。

| Status | 運用 |
| --- | --- |
| `Todo` | Projectに追加済みで、着手前のIssue |
| `Ready` | スコープ・完了条件・依存関係が明確で、着手可能 |
| `In Progress` | 調査または実装中 |
| `Review` | PRがあり、チェックやレビューを待っている |
| `Done` | 完了条件を満たして統合済み。Issueをクローズする |

## 作業の流れ

1. Issueを適切なテンプレートで作成し、Projectに追加して`Todo`にする。
2. トリアージで範囲、完了条件、優先度、依存Issue、テストと文書更新要否を確認する。
3. 着手可能になったIssueを`Ready`にし、作業開始時に`In Progress`へ移す。
4. PR作成後は`Review`にする。レビュー変更や必須チェックが残る間はこの状態を保つ。
5. PR統合後に完了条件を確認し、`Done`へ移してIssueをクローズする。部分完了ならIssueを開いたままにし、必要に応じてフォローアップを作成する。

`Backlog`は現在のProject Status名ではなく、着手前のIssueは`Todo`で管理します。
詳細なIssue作成、Copilot実装、PRレビュー、ラベル運用は[GitHub Workflow](github-workflow.md)を参照してください。
