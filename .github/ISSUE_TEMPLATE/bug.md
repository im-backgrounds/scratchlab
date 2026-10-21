---
name: Bug
about: ScratchLabの不具合を報告する
title: "[Bug] "
labels: type:bug
---

## 現象

何が起きましたか。エラーメッセージがあれば、個人情報を除いて記載してください。

## 再現手順

1.
2.
3.

## 期待結果

## 発生環境

- OS／ブラウザー:
- 譜面・BPM（該当する場合）:
- 入力方法（Mouse／Keyboard／MIDI／該当なし）:
- 発生頻度（毎回／ときどき／一度だけ）:

## 影響範囲

- [ ] BPM Challenge
- [ ] Beginner Course
- [ ] Practice／譜面再生
- [ ] 記録・採点・結果
- [ ] Timing Analysis
- [ ] Controller Overlay
- [ ] 譜面作成・保存
- [ ] その他（具体的に記載）:

対象の譜面、ループ、操作、入力経路などが分かれば記載してください。

## 採点・Event Model v2との関係

- [ ] 採点結果（Accuracy、Matched、Missing、Extra）が誤っている
- [ ] 初期状態・Loop Boundary・Stopの扱いに問題がある
- [ ] Timing Analysisが誤っている
- [ ] Overlayと採点結果が一致しない
- [ ] Event Model v2とは関係しない
- [ ] 判断できない

イベント種別、期待値、実際の値を記載してください。

AccuracyとTiming Analysisは分けて記載してください。

## 原因調査・修正方針（分かる範囲で）

推測は推測として明記してください。原因が不明でも報告できます。

## 完了条件

- [ ] 再現手順で不具合が解消されたことを確認する
- [ ] 関連する回帰条件で既存動作が保たれることを確認する
- [ ] 影響する入力経路・譜面・画面を検証する
- [ ] その他:

## テスト条件

- [ ] 再現ケースの回帰テストを追加する
- [ ] 境界条件・失敗経路のテストを追加する
- [ ] 該当するDenoテストを実行する
- [ ] 該当するMIDI E2E／ブラウザー確認を行う
- [ ] 不要なテストがあれば理由を記載する

## ドキュメント更新判断

- [ ] README.mdを更新する（ユーザー向けの挙動・制約・回避策が変わる）
- [ ] README.mdは更新不要（理由: ）
- [ ] docs/roadmap.mdを更新する（優先度・マイルストーン・状況が変わる）
- [ ] docs/roadmap.mdは更新不要（理由: ）
- [ ] docs/tasks.mdを更新する（追跡中の修正・検証項目が変わる）
- [ ] docs/tasks.mdは更新不要（理由: ）
- [ ] 関連する機能仕様・アーキテクチャ文書を更新する（対象: ）
- [ ] 関連する機能仕様・アーキテクチャ文書は更新不要（理由: ）

## 関連資料

- [BPM Challenge仕様](../../docs/feature-specs/bpm-challenge.md)
- [Event Model v2](../../docs/event-model-v2.md)
- [Roadmap](../../docs/roadmap.md)
- [Tasks](../../docs/tasks.md)
- 関連Issue・Pull Request:
