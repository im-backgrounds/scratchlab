# ScratchLab Tasks

最終更新: 2026-10

---

# Status Legend

- [ ] 未着手
- [~] 作業中
- [x] 完了
- [!] ブロッカー

---

# Current Release

## BPM Challenge v1

Status

[x] Completed

主要機能

- [x] BPM Challenge
- [x] Practice Mode
- [x] Mouse Input
- [x] Keyboard Input
- [x] MIDI Input
- [x] Sequence Accuracy
- [x] Timing Analysis
- [x] Previous Result Display
- [x] Practice History
- [x] Growth Charts
- [x] Achievement System
- [x] Controller Overlay
- [x] Beginner Course
- [x] First Visit Guidance

---

# Critical Epic

## Event Model v2 Migration

Priority

Critical

Reason

Expected Event と Recorded Event の粒度が一致していない。

対象例

- Chirp Scratch
- 1 Click Flare Orbit

影響範囲

- BPM Challenge
- Beginner Course
- Overlay
- Timing Analysis

---

# Epic 1

## Design Freeze

Status

[x] Complete

成果物

- [x] docs/event-model-v2.md

---

# Epic 2

## Expected Timeline v2

Priority

Critical

Status

[~] Generator Implemented / Integration Pending

Tasks

- [x] Event Model v2実装方針確認
- [x] Expected Timeline生成器作成
- [x] ストローク単位へ変更
- [x] Faderイベント分離
- [x] Event生成テスト追加

完了条件

- [x] Chirp期待イベント妥当
- [x] Flare期待イベント妥当
- [ ] 既存イベント定義を置換

生成器は `createExpectedTimeline` として独立追加。採点・Timing・Overlayを
変更しないため、既存の `createExpectedEvents` の置換は後続フェーズへ持ち越す。

---

# Epic 3

## Boundary Rework

Priority

Critical

Status

[~] Input Fixes / Boundary Model Implemented; Integration Pending

Tasks

- [x] 小節reset削除
- [x] Loop Boundary導入（独立API）
- [x] 境界で物理状態を保持・境界由来Stop生成を撤去
- [x] 半開区間モデルと境界時刻の所属判定
- [ ] アプリへのv2境界モデル接続・境界ルール統一

完了条件

- [x] 境界でイベント増殖しない
- [ ] ループ跨ぎ誤判定なし

既存のv1採点・Timing・Overlayへのv2境界API接続は行わない。
実入力のreset・強制Stop生成の撤去によりv1の記録列と結果は変動し得る。
v1のループ区分はそのまま残し、半開区間の採点への適用は後続フェーズで行う。
過去の不具合再現テストは旧処理の明示的な再現として維持する。

---

# Epic 4

## Stop Handling Rework

Priority

Critical

Status

[ ] Not Started

Tasks

- [ ] Mouse停止整理
- [ ] MIDI停止整理
- [ ] Stop定義統一
- [ ] Loop終端との分離

完了条件

- [ ] Stopで誤減点しない
- [ ] Stopで誤加点しない

---

# Epic 5

## Matching Engine v2

Priority

Critical

Status

[ ] Not Started

Tasks

- [ ] 共通Matching Engine
- [ ] 対応ペア保持
- [ ] 初期状態チェック追加
- [ ] Accuracy検証

完了条件

- [ ] Baby Scratch 100%
- [ ] Chirp Scratch 100%
- [ ] Flare Orbit 100%

---

# Epic 6

## Timing Analysis v2

Priority

High

Status

[ ] Not Started

Tasks

- [ ] Matching結果を利用
- [ ] Signed Error保持
- [ ] Average Error統合
- [ ] Max Error統合
- [ ] Timing Accuracy統合

完了条件

- [ ] Accuracyと整合
- [ ] Overlayと整合

---

# Epic 7

## Controller Overlay v2

Priority

High

Status

[ ] Not Started

Tasks

- [ ] Expected Timeline共有
- [ ] Error表示共有
- [ ] 対応ペア共有

完了条件

- [ ] Overlayと採点一致

---

# Epic 8

## Migration

Priority

High

Status

[ ] Not Started

方針

Event Model v2導入時に採点関連データを初期化する。

削除対象

- [ ] Challenge Progress
- [ ] Previous Result
- [ ] Performance Records
- [ ] Practice History
- [ ] Growth Charts
- [ ] Beginner Progress

保持対象

- [x] Achievement
- [x] MIDI Mapping
- [x] Custom Charts
- [x] App Settings

完了条件

- [ ] 一度だけ実行される
- [ ] 再実行安全
- [ ] 古いデータで壊れない

---

# Epic 9

## Integration Test Suite

Priority

Critical

Status

[ ] Not Started

Tasks

- [ ] Input → Recording
- [ ] Recording → Matching
- [ ] Matching → Timing
- [ ] Matching → Overlay

シナリオ

- [ ] Baby Scratch
- [ ] Forward Scratch
- [ ] Backward Scratch
- [ ] Chirp Scratch
- [ ] Transformer Scratch
- [ ] One Click Flare Orbit

完了条件

- [ ] 理想演奏100%
- [ ] 欠落演奏減点
- [ ] 余分演奏減点
- [ ] MIDI/Mouse同結果

---

# Post v2

## Ghost Comparison

Priority

High

Status

[ ] Backlog

Tasks

- [ ] Ghost保存
- [ ] Ghost再生
- [ ] Best Run比較
- [ ] Previous Run比較

---

## Replay Viewer

Priority

Medium

Status

[ ] Backlog

Tasks

- [ ] Replay保存
- [ ] Replay再生
- [ ] Seek対応

---

## Advanced Timing Analysis

Priority

Medium

Status

[ ] Backlog

Tasks

- [ ] Early/Late分析
- [ ] Signed Error表示
- [ ] Heat Map

---

## Share Features

Priority

Low

Status

[ ] Backlog

Tasks

- [ ] Screenshot Export
- [ ] Result Card
- [ ] Share URL

---

## Ranking

Priority

Low

Status

[ ] Backlog

Tasks

- [ ] Local Ranking
- [ ] Online Ranking
- [ ] Season System

---

# Technical Debt

## Medium

- [ ] Date.now → monotonic clock
- [ ] Multi-tab synchronization
- [ ] Storage version management

## Low

- [ ] README再整備
- [ ] スクリーンショット更新
- [ ] 機能仕様書更新

---

# Release Criteria

## Event Model v2 Alpha

必須

- [ ] Chirp 100%
- [ ] Flare 100%
- [ ] Overlay整合
- [ ] Timing整合
- [ ] Migration完了

---

## Event Model v2 Stable

必須

- [ ] Integration Tests
- [ ] Ghost Foundation
- [ ] Data Reset Validation
- [ ] Browser Validation

---

# Notes

最優先事項は Event Model v2。

Ghost機能を先に作らない。

採点基盤を完成させてから、

- Ghost
- Replay
- Ranking

へ進む。
