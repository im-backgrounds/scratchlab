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
- [ ] Stop再設計

実入力の境界resetと境界由来のStop強制生成を撤去済み。
v2制御イベント・状態スナップショット・半開区間APIは独立実装し、
アプリ・v1採点・Timing・Overlayには未接続。Stopの採点対象外化などは後続作業。

---

### Phase 3

Matching Engine v2

- [ ] 共通Matching Engine
- [ ] 対応ペア保存
- [ ] Accuracy再検証

---

### Phase 4

Timing Analysis v2

- [ ] 共通ペア利用
- [ ] Signed Error保持
- [ ] Overlay連携

---

### Phase 5

Overlay v2

- [ ] 共通Expected利用
- [ ] 共通Matching利用
- [ ] Error整合

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
