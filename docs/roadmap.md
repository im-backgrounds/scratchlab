# ScratchLab Roadmap

最終更新: 2026-10

---

# Vision

ScratchLab を

「スクラッチ練習を可視化できる ブラウザーDJトレーニングツール」

として育てる。

目標は

- 練習
- 分析
- 上達確認

ができること。

将来的には

- Ghost Comparison
- ランキング
- コミュニティ共有

まで発展させる。

---

# Current Status

## BPM Challenge v1

完了

### Core

- [x] MIDI入力
- [x] Keyboard入力
- [x] Mouse入力
- [x] Practice Mode
- [x] BPM Challenge

### Analysis

- [x] Sequence Accuracy
- [x] Timing Analysis
- [x] Average Error
- [x] Max Error
- [x] Timing Accuracy

### History

- [x] Practice History
- [x] Growth Charts
- [x] Achievement System

### UX

- [x] Beginner Course
- [x] First Visit Guidance
- [x] Baby Scratch Quick Start
- [x] Previous Result Display

### Visualization

- [x] Controller Overlay
- [x] SAMPLE Timeline
- [x] YOU Timeline
- [x] Error Overlay

---

# Known Issues

現在確認済み。

Phase 7 App Integrationで新規ランタイム分析はEvent Model v2へ切替済み。
以下の粒度不整合は新規実行では解消済みだが、保存済みのv1結果には残る。
保存形式・Progress・Achievementは変更せず、Migrationは未実施。

## Event Model Mismatch

期待イベントと入力イベントの粒度が一致していない。

対象例

- Chirp Scratch
- 1 Click Flare Orbit

影響

- BPM Challenge
- Beginner Course
- Overlay
- Timing Analysis

優先度

Critical

対応

Event Model v2

---

# Next Major Milestone

## Event Model v2 Migration

Status:

Design Frozen

Priority:

Critical

---

# Event Model v2

## 現在の接続状況（実装Phase 7）

- [x] BPM Challenge・Beginner Courseへv2 Matching接続
- [x] Timing・Controller Overlayが同じ対応ペアを利用
- [x] 実入力のBoundary snapshot・Stop observationを接続
- [x] 初期フェーダー未確認／不一致のクリア防止
- [x] Mouse＋Keyboard／模擬MIDIでBaby・Chirp・Flare 100%
- [x] 過去記録は再採点せず再挑戦を案内
- [ ] 保存データMigration（別フェーズ）

下記Phase 1〜5の未接続説明は独立API実装時点の履歴。
Phase 7ではランタイムのみ接続し、保存形式と既存Progress／Achievement処理は維持する。

目的

採点モデルを統一する。

現在

Expected Event ≠ Recorded Event

となっている。

これを

Meaning Event

へ統一する。

---

## Goals

- 採点信頼性向上
- Overlay整合
- Timing整合
- Beginner整合
- Ghost基盤構築

---

## Scope

### Event Model

- Forward Stroke
- Backward Stroke
- Fader Open
- Fader Close
- Stop
- Loop Boundary

### State Model

- currentDirection
- faderState
- loopState

### Timeline

- Expected Timeline
- Recorded Timeline

### Matching

- Common Matching Engine

### Analysis

- Timing Analysis v2

### Visualization

- Overlay v2

---

## Tasks

### Phase 1

Expected Timeline v2

- [x] ストローク単位モデル
- [x] フェーダー状態モデル
- [x] 共通タイムライン生成

生成器のみ実装済み。v1採点経路は維持し、Matching・Timing・Overlayへの接続は
後続フェーズで行う。

---

### Phase 2

Boundary Rework

- [x] 小節reset廃止
- [x] ループ境界再設計
- [x] Stop再設計（観測API・入力処理）

実入力の境界resetと境界由来のStop強制生成を撤去済み。
v2制御イベント・状態スナップショット・半開区間APIは独立実装し、
アプリ・v1採点・Timing・Overlayには未接続。

Stop Handling（実装Phase 3 / Epic 4）ではMouse/MIDIの停止検出を共通化し、
物理停止観測の独立APIを追加済み。操作解除とLoop BoundaryはStopを作らない。
v2観測の接続・Stopの採点対象外化は後続作業。

---

### Phase 3

Matching Engine v2

- [x] 共通Matching Engine（実装Phase 4 / Epic 5、独立API）
- [x] 対応ペア保持（メモリー内）
- [x] Accuracy再検証（Baby・Chirp・Flareの圧縮済み理想入力100%）

Stop・Loop Boundaryは除外し、半開区間ごとに照合する。
冒頭の同方向継続は一致として数えるがTiming対象外。
初期フェーダー検証は一致率と別に返す。アプリ・Challenge結果・Timing・Overlayへの
接続と永続化は未実施。

---

### Phase 4

Timing Analysis v2

- [x] 共通ペア利用（実装Phase 5 / Epic 6、独立API）
- [x] Signed Error保持
- [x] Overlay独立APIへ測定サンプル共有

Matching結果を再照合せず利用する。継続観測・Stop・境界・Missing・Extraは測定しない。
Average Error・Max Error・Timing Accuracy・Measured Countとペア別誤差を返す。
アプリ・Challenge結果・Overlayへの接続は未実施。既存v1 Timingは未変更。

---

### Phase 5

Overlay v2

- [x] 共通Expected利用（実装Phase 6 / Epic 7、独立API）
- [x] 共通Matching利用
- [x] Error整合（Missing・Extra・Initial State Error）

SAMPLE・YOU・ERRORの表示データを生成し、Timing結果のサンプルを共有する。
Stop・境界・デモは表示しない。3対象譜面でMissing・Extra・測定件数を検証済み。
既存UI・Challenge結果・Progress・保存への接続は未実施。

---

### Phase 6

Migration

- [ ] 採点データ初期化
- [ ] Progress初期化
- [ ] History初期化
- [ ] Growth初期化
- [ ] Beginner Progress初期化

保持

- [x] MIDI Mapping
- [x] Custom Charts
- [x] Achievement

---

### Phase 7

Integration Tests

- [ ] Mouse → Score
- [ ] MIDI → Score
- [ ] Timing Accuracy
- [ ] Overlay Accuracy
- [ ] Chirp 100%
- [ ] Flare 100%

---

# Post v2 Features

優先度順

---

## Ghost Comparison

演奏履歴比較

- [ ] Best Run
- [ ] Previous Run
- [ ] Ghost Overlay

優先度

High

---

## Replay Viewer

- [ ] リプレイ保存
- [ ] 再生
- [ ] 巻き戻し

優先度

Medium

---

## Advanced Timing Analysis

- [ ] Signed Error
- [ ] Early/Late分析
- [ ] Heat Map

優先度

Medium

---

## Ranking

- [ ] Local Ranking
- [ ] Community Ranking

優先度

Low

---

## Share Features

- [ ] Result Card
- [ ] Screenshot Export
- [ ] Share URL

優先度

Low

---

# Monetization

検討段階

実装未定

候補

- Ads
- Supporter Plan
- Premium Analytics

条件

Event Model v2 完了後

---

# Release Plan

## Current

v1.0-beta

---

## Next

v2.0-alpha

条件

- Event Model v2 完了
- Chirp 100%
- Flare 100%
- Overlay整合
- Timing整合

---

## Future

v2.0

条件

- Ghost Comparison
- Replay
- Integration Tests安定化

---

# Success Criteria

v2完了時

- 正しい演奏は100%
- MouseとMIDIで同結果
- Overlayと採点一致
- Timingと採点一致
- BeginnerとChallenge一致
- Ghost比較可能

以上を満たした時点で

ScratchLab の採点基盤は完成とみなす。
