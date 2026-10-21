---
name: Tech Debt
about: ScratchLabの保守性・信頼性を高める技術的改善を提案する
title: "[TechDebt] "
labels: type:tech-debt
---

## 課題

改善対象のコード・設計・テスト・開発手順を具体的に示してください。
関連ファイル、重複箇所、既知の制約があれば記載してください。

## 背景・問題点

- 現在の問題（変更コスト、障害リスク、重複、テスト困難など）:
- 放置した場合の影響:
- 課題を確認できる根拠（コード、テスト、Issueなど）:

## 改善内容

何をどこまで変更しますか。既存挙動を変えない改善か、意図的な挙動変更を伴うか明記してください。

### 対象範囲

- 対象:
- 対象外:
- 前提・依存Issue:

## BPM Challengeとの関係

- [ ] Challengeの進行・合否・結果に関係する
- [ ] Beginner Courseに関係する
- [ ] 関係しない

関係する場合は、既存の合否条件・進捗・結果表示をどう維持または変更するか記載してください。
Timing Analysisの変更だけでAccuracyや合否条件を変更しないでください。
これらの変更には関連仕様の合意が必要です。

## Event Model v2との関係

- [ ] Event生成・圧縮・Meaning Eventに関係する
- [ ] Matching・Accuracy・Missing／Extraに関係する
- [ ] Timing Analysisに関係する
- [ ] 初期状態・Loop Boundary・Stopに関係する
- [ ] Controller Overlayに関係する
- [ ] Mouse／Keyboard／MIDIの入力経路に関係する
- [ ] 関係しない

関係する場合、Expected／Recorded／Matchingの共通モデルを維持する方法、
採点結果・Timing・Overlayへの影響、必要な回帰テストを記載してください。
チャート固有の採点規則や別のイベントモデルを導入しないでください。

## 互換性・リスク

- [ ] ユーザー向け挙動を変えない
- [ ] LocalStorageや保存形式を変更しない
- [ ] 保存形式の変更がある（理由・影響・移行方針を記載）
- [ ] API・モジュール境界を変更する
- [ ] その他のリスク:

既存データを黙って削除・変換しないでください。保存形式を変える場合は、
データ整合性、後方互換性、移行・復旧方針を明記してください。

## 完了条件

- [ ] 改善対象の問題が解消されたことを確認する
- [ ] 既存のユーザー向け挙動・データが保たれることを確認する
- [ ] 影響範囲に応じた回帰テストを追加・更新する
- [ ] 保守上の効果を確認できる結果を記載する
- [ ] その他:

## テスト条件

- [ ] 対象モジュールのユニット・回帰テスト
- [ ] `deno check`／`deno lint`／フォーマット確認（変更範囲に応じて）
- [ ] BPM Challenge／Beginner Courseの関連テスト
- [ ] MIDI E2E／ブラウザー確認（入力経路に関係する場合）
- [ ] 不要なテストがあれば理由を記載する

## ドキュメント更新判断

- [ ] README.mdを更新する（ユーザー向け挙動・設定・制約が変わる）
- [ ] README.mdは更新不要（理由: 内部実装のみ等）
- [ ] Issue・Project・Milestoneを更新する（追跡作業・優先度・合意範囲が変わる）
- [ ] GitHubの計画更新は不要（理由: ）
- [ ] 関連する機能仕様・アーキテクチャ文書を更新する（対象: ）
- [ ] 関連する機能仕様・アーキテクチャ文書は更新不要（理由: ）

## 関連資料

- [BPM Challenge仕様](../../docs/feature-specs/bpm-challenge.md)
- [Event Model v2](../../docs/event-model-v2.md)
- [Architecture Decisions](../../docs/architecture-decisions.md)
- [ScratchLab Development](https://github.com/users/im-backgrounds/projects/3)
- [GitHub Milestones](https://github.com/im-backgrounds/scratchlab/milestones)
- 関連Issue・Pull Request:
