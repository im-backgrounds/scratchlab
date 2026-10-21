# GitHub Project 運用

ScratchLabの作業は **ScratchLab Development** Projectで管理します。
Issueの要件・完了条件はIssueを正とし、Projectは進行状況と優先度の管理に使います。
Project項目とIssueラベルは自動同期されないため、優先度を変更するときは両方を更新してください。

## ステータス

現在のProjectで使用するStatusは次のとおりです。

| Status        | 運用                                            |
| ------------- | ----------------------------------------------- |
| `Todo`        | Projectに追加済みで、着手前のIssue              |
| `Ready`       | スコープ・完了条件・依存関係が明確で、着手可能  |
| `In Progress` | 調査または実装中                                |
| `Review`      | PRがあり、チェックやレビューを待っている        |
| `Done`        | 完了条件を満たして統合済み。Issueをクローズする |

## 作業の流れ

1. Issueは適切なテンプレートを本文の基にし、GitHub
   CLI/APIを使うスクリプトで作成する。対話式のIssue作成ツールやフォームは使用しない。作成前にOpen/Closedの重複を確認し、作成後に本文・ラベルを再取得して検証する。
2. サブIssueを持たない末端IssueをすべてProjectに登録する。子のない親Issueや単独Issueも対象とし、多段階の親子関係では末端のサブIssueを登録する。親だけの登録で代替しない。
   既存の登録を確認して重複追加せず、既存項目は削除しない。新規登録は`Todo`にし、Priorityを優先度ラベルと一致させる。既存項目のStatusは意図した遷移でない限り維持する。登録後に所属・Status・Priorityを再取得して確認する。
3. トリアージで範囲、完了条件、優先度、依存Issue、テストと文書更新要否を確認する。
4. 着手可能になったIssueを`Ready`にし、作業開始時に`In Progress`へ移す。
5. PR作成後は`Review`にする。レビュー変更や必須チェックが残る間はこの状態を保つ。
6. PR統合後に完了条件を確認し、`Done`へ移してIssueをクローズする。部分完了ならIssueを開いたままにし、必要に応じてフォローアップを作成する。

Projectの参照・更新権限がない場合は、未登録のIssueと必要な権限を報告する。
Issueを作成しただけでProjectへの登録も完了したとは扱わない。

`Backlog`は現在のProject Status名ではなく、着手前のIssueは`Todo`で管理します。
詳細なIssue作成、Copilot実装、PRレビュー、ラベル運用は[GitHub Workflow](github-workflow.md)を参照してください。
