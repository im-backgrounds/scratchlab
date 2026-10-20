# Event Model v2

Status: Design Frozen (Draft)

## Background

BPM Challenge v1
の採点モデル調査により、期待イベントと入力イベントの粒度が一致していないことが判明した。

代表例:

- Chirp Scratch
- 1 Click Flare Orbit

これらの譜面では、正しい演奏を行っても入力圧縮によって同方向スクラッチが除去されるため、期待イベント数と入力イベント数が一致しない。

結果として、

- BPM Challenge
- Beginner Course
- Controller Overlay
- Timing Analysis

の信頼性に影響する可能性がある。

Event Model v2 は、採点・表示・分析・将来の Ghost Comparison
を同一のイベントモデルで扱うことを目的とする。

---

# Problem Statement

v1 では以下の問題がある。

## Expected Event と Recorded Event の粒度不一致

期待イベント:

- 譜面イベント単位

入力イベント:

- 方向変化単位

その結果、

```text
譜面:
F → FF

期待:
Forward
Forward

入力:
Forward
```

となる。

---

## Boundary Reset 問題

小節境界やループ境界で状態をリセットしているため、

- 存在しない入力が生成される
- 余分な入力として採点される

可能性がある。

---

## Stop 問題

現在の Stop は

- MIDI 停止タイマー
- Mouse 停止タイマー
- ループ終端

が混在している。

これにより、

- 実停止
- 記録終了

を区別できない。

---

# Goals

- 期待イベントと入力イベントの意味を一致させる
- BPM Challenge の採点信頼性向上
- Beginner Course の採点統一
- Timing Analysis の正確化
- Overlay と採点結果の整合
- Ghost Comparison の土台を作る

# Non Goals

本バージョンでは以下を行わない。

- 移動距離評価
- スクラッチ速度評価
- 音声品質評価
- ランキングシステム
- ネットワーク同期

---

# Event Model

## Event Types

### Forward Stroke

停止または後進状態から前進へ移行したことを表す。

採点対象。

---

### Backward Stroke

停止または前進状態から後進へ移行したことを表す。

採点対象。

---

### Fader Open

フェーダーが閉から開へ変化したことを表す。

採点対象。

---

### Fader Close

フェーダーが開から閉へ変化したことを表す。

採点対象。

---

### Stop

一定時間以上の無入力から推定される停止状態。

採点対象外。

---

### Loop Boundary

ループ開始・終了を示す制御イベント。

採点対象外。

---

# State Model

## currentDirection

状態:

- unknown
- forward
- backward
- stopped

ルール:

- 初期値は unknown
- 同方向連続入力ではイベント生成しない
- 方向変化時のみイベント生成
- Stop後の入力は新規ストローク

---

## faderState

状態:

- unknown
- open
- closed

ルール:

- 状態変化のみイベント生成
- 同状態連続入力は除外
- Directionとは独立

---

## loopState

保持情報:

- Session Id
- Loop Index
- Phase
- Start Time
- End Time
- Start Direction
- Start Fader State

用途:

- 採点区間管理
- Timing Analysis
- Overlay

---

# Expected Timeline

## Phase 1 実装状況

`src/domain/performance-analysis.js` の `createExpectedTimeline` が、 Meaning
Event と譜面上の `tick` を一緒に持つ配列を生成する。
初期フェーダーは開。同方向の継続は統合し、カットの閉→開は維持する。
Kと終端からStopを生成しない。Loop Boundaryの導入は後続フェーズで扱う。

現在の `createExpectedEvents` はv1採点・Timingとの互換経路として維持する。
v2生成器はまだアプリの採点・Timing・Overlayへ接続していないため、 Phase
1だけでは画面の一致率や既存の採点不整合は変わらない。

## 原則

譜面から単一の期待タイムラインを生成する。

以下で共通利用する。

- BPM Challenge
- Beginner Course
- Timing Analysis
- Overlay

---

## Direction Rules

方向変化のみ生成する。

例:

```text
F → F

期待:
Forward
```

```text
F → FF

期待:
Forward
```

```text
F → B

期待:
Forward
Backward
```

---

## Fader Rules

開閉変化は維持する。

例:

```text
FC3

期待:

Forward
Close
Open
Close
Open
Close
Open
```

---

## K Rules

K は物理 Stop を要求しない。

タイムライン終端は Loop Boundary で表現する。

---

# Recorded Timeline

## Input Sources

### Mouse

生成:

- Forward Stroke
- Backward Stroke
- Stop

---

### Keyboard

生成:

- Fader Open
- Fader Close

---

### MIDI

生成:

- Forward Stroke
- Backward Stroke
- Fader Open
- Fader Close
- Stop

---

## 共通ルール

処理順:

1. 入力受信
2. 状態更新
3. 状態変化抽出
4. イベント生成
5. タイムスタンプ付与
6. 記録

---

# Matching Rules

## レーン分離

以下を独立照合する。

### Scratch Lane

- Forward
- Backward

### Fader Lane

- Open
- Close

---

## 一致率

```text
Accuracy
=
Matched
/
(
Matched
+
Missing
+
Extra
)
×100
```

---

## Stop

Stop は分母に含めない。

---

## Loop Boundary

Loop Boundary は採点対象外。

---

## Initial State Validation

採点とは別に確認する。

確認対象:

- 初期フェーダー状態

条件:

- 未確認
- 不一致

の場合はクリア不可。

---

# Timing Rules

## 対象

Timing対象:

- Forward
- Backward
- Open
- Close

対象外:

- Stop
- Loop Boundary

---

## 対応付け

Timing Analysis は

Matching Engine

と同一の対応ペアを利用する。

---

## Metrics

### Average Error

平均絶対誤差

### Max Error

最大絶対誤差

### Timing Accuracy

```text
Timing Accuracy
=
max(
  0,
  100 * (1 - AverageErrorMs / 100)
)
```

---

## 注意

Timing Accuracy は

Challenge Accuracy

ではない。

合否には使用しない。

---

# Overlay Rules

## SAMPLE

Expected Timeline を表示。

---

## YOU

Recorded Timeline を表示。

---

## ERROR

Matching Engine の結果のみ使用。

分類:

- Missing
- Extra
- Initial State Error

---

## 禁止事項

Overlay で独自の採点を行わない。

---

# Beginner Course Rules

Beginner Course は

BPM Challenge と同じ Event Model を利用する。

別採点エンジンを作らない。

---

# Achievement Impact

## v2以降

Achievement 判定は v2 の結果を利用する。

---

## 既存 Achievement

既存 Achievement は保持する。

解除済み実績を取り消さない。

---

# Migration Strategy

## 方針

v1 と v2 は共存しない。

Event Model v2 導入時に

採点関連データのみ初期化する。

---

## リセット対象

- Challenge Progress
- Previous Result
- Performance Records
- Practice History
- Growth Charts
- Beginner Course Progress

---

## 維持対象

- MIDI Mapping
- Custom Charts
- 編集中データ
- UI設定
- 初回ガイド状態
- Achievement

---

## リセット理由

v1 データは

- 欠落イベント
- Stop情報不足
- 境界処理の差異

を含むため、

v2へ再採点できない。

---

# Required Refactors

## Domain

- performance-analysis.js
- performance.js
- midi-mapping.js
- challenge-session.js
- bpm-challenge.js
- beginner-course.js
- achievement-system.js

## Features

- performance-view.js
- practice-view.js

## UI

- performance.js
- challenge.js

## Tests

- performance-analysis
- performance-recording
- challenge-session
- overlay
- timing-analysis

---

# Acceptance Criteria

以下を全て満たすこと。

## Accuracy

- Baby Scratch 正解演奏 → 100%
- Chirp Scratch 正解演奏 → 100%
- 1 Click Flare Orbit 正解演奏 → 100%

## Boundary

- 小節境界でイベント増殖しない
- ループ境界でイベント増殖しない

## Stop

- Stop不足で誤減点しない
- Stop過剰で誤加点しない

## Input Consistency

- Mouse と MIDI が同じ結果になる

## Timing

- Timing と Accuracy が同じ対応ペアを利用する

## Overlay

- Overlay の Missing / Extra が採点結果と一致する

## Migration

- v1データによって v2 が壊れない

---

# Risk Assessment

## High

- Event Model刷新による採点結果変化
- 既存ベストスコア消失

## Medium

- Overlay修正漏れ
- Timing対応漏れ
- Beginner Course整合性

## Low

- MIDI Mapping
- Custom Charts
- UI設定

---

# Final Decision

Event Model v2 を採用する。

採点・Timing・Overlay・Beginner Course が共通の Expected Timeline と Matching
Engine を利用する。

v1 の採点結果との互換性は維持しない。

採点の信頼性を優先する。
