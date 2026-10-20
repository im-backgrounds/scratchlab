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

[~] Observation API / Input Handling Implemented; Scoring Integration Pending

Tasks

- [x] Mouse停止整理
- [x] MIDI停止整理
- [x] Stop定義統一（独立した物理停止観測API）
- [x] Loop終端との分離
- [x] 最後の入力元への観測引き継ぎ・操作解除時の観測キャンセル
- [x] 停止観測を保持し、方向状態のみ更新するAPI

完了条件

- [ ] Stopで誤減点しない
- [ ] Stopで誤加点しない

v2 APIは採点・Timing・Overlay・アプリへ未接続。
実入力は共通停止検出器を使い、従来のStopイベント形式とv1採点を維持する。
Stopによる誤減点・誤加点の解消はMatching Engineの接続時に検証する。
v1のflush互換APIと過去の不具合再現テストは維持する。

---

# Epic 5

## Matching Engine v2

Priority

Critical

Status

[x] Runtime Integrated (Implementation Phase 7)

Tasks

- [x] 共通Matching Engine（独立API）
- [x] 対応ペア保持（元配列インデックス、実入力／継続観測を区別）
- [x] 初期状態チェック追加（一致率と分離）
- [x] Accuracy検証（独立した理想入力を圧縮して照合）

完了条件

- [x] Baby Scratch 100%
- [x] Chirp Scratch 100%
- [x] Flare Orbit 100%

独立Engineに加え、アプリのChallenge・Beginner Courseへ接続済み。
Timing・Overlayも同じ分析結果を利用する。Progressの処理・保存形式は変更しない。
Stopと境界を除外し、tick
0の同方向継続はTiming対象外の一致として保持する。
未確認・不一致の初期フェーダーは、ランタイムでクリア・進捗更新を阻止する。

---

# Epic 6

## Timing Analysis v2

Priority

High

Status

[x] Runtime Integrated (Implementation Phase 7)

Tasks

- [x] Matching結果を利用（同じ対応ペアを再照合なしで利用）
- [x] Signed Error保持
- [x] Average Error集計（独立API）
- [x] Max Error集計（独立API）
- [x] Timing Accuracy集計（独立API）
- [x] Measured Count・測定不能時のnull出力
- [x] 継続観測・Stop・境界の除外、Missing／Extraを0msにしない

完了条件

- [x] Accuracyと同じ対応ペアを利用・Sequence Accuracyを変更しない
- [x] Overlay独立APIで同じ測定サンプル・測定件数を共有

`analyzeTimelineTiming` をアプリへ接続し、Challenge TimingとOverlayで共有する。
Average・Max・Accuracy・Measured Countを表示する。v1 APIは残すが経路では使わない。
Migration・Achievementの処理は未変更。

---

# Epic 7

## Controller Overlay v2

Priority

High

Status

[x] Runtime Integrated (Implementation Phase 7)

Tasks

- [x] Expected Timeline共有
- [x] Recorded TimelineからYOU表示データを生成
- [x] Error表示共有（Missing・Extra・Initial State Error）
- [x] 対応ペア・Timing測定サンプル共有
- [x] Stop・境界を除外し、継続観測からYOU入力を捏造しない

完了条件

- [x] 独立APIでMissing・Extra・Timing対象件数一致（Baby・Chirp・Flare）
- [x] UI接続後のOverlayと採点一致

`createPerformanceOverlay` は表示用データのみを返す。
独自の判定ロジックは使わず、Matching・Timingの結果を投影する。
既存画面はv2の結果を表示し、SAMPLE・YOU・ERROR・Timing件数を共有する。
お手本は採点せず、再生中の未到来イベントはMissingにしない。
旧データの再採点・Migrationは行わず、Progress・Achievementの実装は維持する。

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

[~] Phase 7 Runtime Tests Added / Full Chart Coverage Pending

Tasks

- [x] Input → Recording（ブラウザーでMouse＋Keyboard／模擬MIDIを確認）
- [x] Recording → Matching
- [x] Matching → Timing
- [x] Matching → Overlay

シナリオ

- [x] Baby Scratch
- [ ] Forward Scratch
- [ ] Backward Scratch
- [x] Chirp Scratch
- [ ] Transformer Scratch
- [x] One Click Flare Orbit

完了条件

- [x] 理想演奏100%（上記3譜面）
- [x] 欠落演奏減点
- [x] 余分演奏減点
- [x] MIDI/Mouse同結果（上記3譜面、模擬MIDI）

Phase 7ではfeature層の回帰テスト12件を追加。
保存形式維持、過去記録の未採点、初期状態不正、記録上限超過、
デモ除外、将来イベントのMissing防止、停止位置固定も検証する。
実機MIDI・全譜面・Migration後の網羅確認は未完了。

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
