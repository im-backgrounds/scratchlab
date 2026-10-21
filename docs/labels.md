# Issue ラベル

`.github/labels.json`をラベル名・色・説明の定義元とします。
新しいIssueには以下の現行体系を使い、移行用の旧ラベルは適用しません。

## 分類

Issueには次のうち**ちょうど1つ**を付けます。

| ラベル           | 用途                           |
| ---------------- | ------------------------------ |
| `type:feature`   | 新機能・ユーザー体験の改善     |
| `type:bug`       | 再現可能な不具合               |
| `type:tech-debt` | 保守性・信頼性・構造の改善     |
| `type:task`      | 調査・検証・開発環境などの作業 |
| `type:test`      | テスト・品質保証に関する作業   |
| `type:docs`      | ドキュメント更新に関する作業   |

Epicを複数の子Issueにまとめる場合は、上記の分類ラベルに加えて
`epic`を付けます。GitHub Sub-Issue機能で親子関係を管理します。

旧来の分類名は次の現行ラベルに対応させます。

| 分類名          | 現行ラベル       |
| --------------- | ---------------- |
| `feature`       | `type:feature`   |
| `bug`           | `type:bug`       |
| `task`          | `type:task`      |
| `refactor`      | `type:tech-debt` |
| `documentation` | 該当する`docs:*` |
| `ci`            | `area:ci`        |

## 優先度

トリアージ済みIssueにはProjectのPriorityと一致するラベルを1つ付けます。
Project項目とラベルは自動同期されないため、必ず両方を更新してください。

| ラベル        | Project値 | 意味                                   |
| ------------- | --------- | -------------------------------------- |
| `priority:p0` | `P0`      | 緊急。主要機能の停止やデータ損失など   |
| `priority:p1` | `P1`      | 高。主要機能や採点の信頼性に大きく影響 |
| `priority:p2` | `P2`      | 通常。計画的に対応する改善・不具合     |
| `priority:p3` | `P3`      | 低。影響が限定的で延期可能             |

## 影響範囲・作業種別

必要に応じて該当するラベルを追加します。

- `area:*`: BPM Challenge、Event Model
  v2、Ghost、Replay、MIDI、UI、scoring、CI、testing、coverage
- `docs:*`: README、roadmap、tasks、specification
- `test:*`: unit、regression、e2e、midi-e2e、manual

実際のラベル名と説明は`.github/labels.json`を確認してください。

## 状態管理と旧ラベル

進行状態はラベルでなく、**ScratchLab Development** ProjectのStatus
(`Todo`、`Ready`、`In Progress`、`Review`、`Done`)で管理します。
したがって、`blocked`、`needs-review`、`ready`を別の状態ラベルとしては使いません。
ブロック理由はIssue上で明記し、状態はProjectで更新してください。

旧ラベルは`.github/labels.json`の移行対応に従います。
`enhancement`は`type:feature`、`bug`は`type:bug`、`refactor`は
`type:tech-debt`へ移行し、新規Issueには旧名を使いません。
