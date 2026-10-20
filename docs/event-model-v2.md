# Event Model v2

Status: Completed — Official Implementation

`src/domain/performance-analysis.js`の`EVENT_MODEL_VERSION = 2`を正式なモデル番号とする。
現在のブランチが正式実装であり、v1スコアとの互換レイヤーは作らない。
この番号は保存形式のバージョンではない。

## Phase 7 App Integration（現在の実装）

- Expected → Matching → Timing → Overlayを共通の分析結果としてアプリへ接続。 BPM
  Challenge・Beginner Course・直後の結果・Controller Overlayで共有する。
- 実際のループ開始／終了時刻でBoundary snapshotを保持する。小節境界や
  ループ末尾のtickでは物理状態をresetしない。Mouse/MIDIのStopは物理停止観測と
  して記録し、Matching・Timing・Overlayから除外する。
- 初期フェーダーが未確認／閉なら一致率にかかわらずクリア不可。
  この場合と記録上限超過時はProgress・Achievementへの結果通知を行わない。
- アプリの分析コンテキストはメモリー内だけで保持する。保存形式version 1は
  変更しない。保存用Stopは従来形式へ投影し、境界・対応ペアは保存しない。
- 再読込／インポートした記録は初期状態情報を復元できないため、v2で再採点せず
  再挑戦を案内する。別譜面の結果も流用しない。
- SAMPLEはExpected v2、YOUはRecorded、ERRORはMatchingの投影。
  記録2ループをそれぞれ表示し、Missing・Extra・Initial State Error・Timing件数は
  全ループの合計を表示する。再生中は経過区間だけを暫定判定し、
  未到来イベントをMissingにしない。お手本は採点対象外。
- Migration・データ移行・初期化・変換は行わない。
  Storage・Progress／Achievementのロジック・スキーマと既存データは維持する。
  Previous Result・履歴の旧スコアをv2へ換算しない。

Expected・Boundary・Stop・Matching・Timing・Overlay・App Integrationは完了。
実機MIDI検証・全譜面E2E・Ghost Foundation・Replay Viewerは別の残作業とする。
詳細は[Tasks](tasks.md)と[リリースノート](releases/event-model-v2.md)を参照。

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

# Problem Statement（解決済みのv1問題）

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

v1では小節境界やループ境界で状態をリセットしていたため、

- 存在しない入力が生成される
- 余分な入力として採点される

可能性がある。

---

## Stop 問題

v1の Stop は

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

Phase 3（Epic 4）の `midi-mapping.js` では以下を独立APIとして提供する。

- `createStopObservation`：不変の物理停止観測を生成する。
  `type: "stop"`、`reason: "inactivity"`、`source: "mouse" | "midi"`、
  `lastMovementAt`、`timeoutMs`、`time` を保持する。
- `createStopObserver`：Forward/Backwardの生入力ごとにタイマーを更新し、
  無入力時に観測を通知する。フェーダー・Stop・Loop
  Boundaryはタイマーを更新しない。
- `createEventCompressor.observeStop`：方向だけを `stopped` にし、
  フェーダー状態は保持する。採点用イベントは返さず、観測は通知先が別途保持する。

`time` は最後の移動時刻＋停止閾値の絶対ミリ秒。
タイマー配送の遅延や記録区間の終端に合わせて時刻を変更しない。
初回移動前にはStopを生成しない。キャンセル済み・古い・重複タイマー通知も生成しない。
閾値はMouse 180ms、MIDI 150msを維持する。

v2観測APIには `flush` を設けない。ループ・記録の開始／終了は物理停止ではない。
観測がループ境界を跨いだ場合は観測時刻により区間へ所属させる。

アプリは`createStopObserver`を使用し、v2観測を実行時の記録へ保持する。
ログ・保存用のStopは既存の`{ type: "scratch", direction: "stop", time }`表現を
維持するが、採点には使わない。
`createStopDetector`の公開利用と`flush`は非推奨として残置する。
タイマー本体は`createStopObserver`が内部利用するため単純削除しない。
`flush`はアプリから呼ばず、v2 APIにも公開しない。

---

### Loop Boundary

ループ開始・終了を示す制御イベント。

採点対象外。

`playback.js` の `createLoopBoundary` として定義し、アプリから利用する。
`type: "loop-boundary"`、`edge: "start" | "end"`、`sessionId`、`loopIndex`、
`phase: "demo" | "recording"`、`time`、`currentDirection`、`faderState` を持つ。
時刻は入力イベントと同じ絶対ミリ秒。状態は境界時点のコピーで、入力を生成しない。

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

`createLoopState` は同じセッション・ループ・フェーズの開始境界と
終了境界から完了区間を作る。区間は `[startTime, endTime)` とし、
境界時刻ちょうどの入力は次ループに属する。開始方向と開始フェーダー状態を保持する。

アプリ・採点・Timing・Overlayは同じv2境界を利用する。保存用の既存`loopEnds`は
変更せず、v2の初期状態情報がない保存記録から区間を推測して再採点しない。

---

# Expected Timeline

## Phase 1 実装状況

`src/domain/performance-analysis.js` の `createExpectedTimeline` が、 Meaning
Event と譜面上の `tick` を一緒に持つ配列を生成する。
初期フェーダーは開。同方向の継続は統合し、カットの閉→開は維持する。
Kと終端からStopを生成しない。Loop Boundaryは独立した制御イベントとする。

`createExpectedTimeline`は正式ランタイムの期待生成器。
`createExpectedEvents`は非推奨のv1再現APIとしてのみ残し、正式経路では使わない。

## Phase 2 入力経路の修正

実入力の圧縮状態を、小節境界・ループ境界・デモから記録への移行でリセットしない。
`createEventCompressor.getState()` は境界モデル用の独立した状態コピーを返す。
方向とフェーダーは継続し、実際の方向変化・開閉変化・無入力によるStopだけで更新する。

記録ループ切り替え・記録終了時のMIDI Stop強制flushを廃止する。
記録開始時も停止タイマーを破棄しない。Mouse/MIDIの通常の無入力タイマーと
停止検出時間は維持し、Loop Boundary自体からStopを生成しない。

採点はv2へ接続済み。境界snapshotにより冒頭の継続を確認し、存在しない
ストロークや終端Stopを要求しない。保存形式は変更しない。

## Phase 3 Stop入力経路の整理

MouseとMIDIの無入力検出を `createStopObserver` へ統一する。 内部のタイマー処理は
`createStopDetector` と共有する。
Mouseでは圧縮前・120ms間引き前の全移動で停止タイマーを更新する。
複数入力元を使う場合は、最後に移動入力が来た入力元へ停止観測を引き継ぐ。
古い入力元のタイマーはキャンセルし、同時操作中の偽のStopを防ぐ。
フェーダー入力ではこの引き継ぎを行わない。

Esc・練習モード解除・フォーカス喪失・画面切り替えは観測キャンセルであり、
物理Stopは生成しない。必要な音声停止は記録イベントを介さず実行する。
キャンセルでは圧縮器へ停止状態を捏造せず、境界でも物理状態を破棄しない。

v2観測は実入力へ接続済み。Stop不足・過剰は採点やTiming件数に影響しない。

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

## Phase 4 実装状況（Epic 5）

`performance-analysis.js` の `matchPerformanceTimeline`
を独立APIとして追加した。 入力は `createExpectedTimeline` のMeaning
Event配列、記録済みイベント配列、 `createLoopState`
のループ区間配列。記録イベントは入力圧縮済みで、 同じ絶対ミリ秒時計の `time`
を持ち、配列は時刻順とする。 期待配列はMeaning Eventのみを受け付け、順序付きの
`tick` を持つ。

記録配列のStop観測・従来形式Stop・Loop Boundaryは採点から除外する。
Stopで同方向ストロークが再開された場合のイベントを再圧縮して消すことはしない。
デモは採点しない。各記録ループの `[startTime, endTime)` 内だけで独立照合し、
区間外・デモ内のMeaning Eventは `unassignedActualIndexes` で明示する。
不正なイベント・時刻・重複区間・異なるセッションの区間は例外で通知する。

照合は既存のLCS補助処理を再利用し、レーンごとの順序を維持する。
曖昧な対応では既存と同じく期待側を先に進める決定的な規則を使う。
一致率は時刻差ではなく対応数から計算し、ループ合計の件数で集計する。
比較対象がなければ一致率は `null`。

戻り値:

- `pairs`：`loopIndex`、`lane`、`kind`、元配列の `expectedIndex` /
  `actualIndex`、 `expectedTick`、`actualTime`、`source`、`timingEligible`。
- `missingEvents` / `extraEvents`：元配列インデックス・ループ・種類・位置。
- `matched` / `missing` / `extra`、`accuracy`、Meaning Event別の `byKind`。
- `loops`：記録ループごとの集計と `initialState`。
- `initialStateValid`：記録ループがあり、すべての初期フェーダー状態が検証済みか。
- `expectedCount`：継続観測を含む期待数。 `actualCount`：区間内の実Meaning
  Event数（継続観測やStopは含めない）。

ループ開始方向がtick
0の最初の期待ストロークと同じ場合、継続観測による一致とする。
`source: "initial-state"`、`actualIndex: null`、`actualTime: null`、
`timingEligible: false` で保持し、架空の入力やTimingサンプルを作らない。
K後などtick
0以外の開始ストロークや、unknown・stopped・逆方向はこの扱いにしない。
通常の実入力対応は `source: "event"`、`timingEligible: true`。

初期フェーダーは生成器と同じopenを要求する。境界スナップショットがunknownなら
`unconfirmed`、closedなら `mismatch`、openなら `valid`。
後続の開閉イベントでは初期状態を推測しない。冒頭のCloseも通常どおり照合する。
一致率100%でも初期状態が未確認・不一致ならクリア不可とするため、
アプリは一致率とは別に `initialStateValid` を確認する。
Engine自体はChallengeの合否・進捗更新・Timing計算を行わない。

Baby・Chirp・1 Click Flareは、期待生成器とは独立した理想操作列を圧縮して
2ループとも100%となることを検証済み。
アプリ・UI・Challenge結果・Timing・Overlayへ接続済み。
対応ペアと境界snapshotは保存せず、メモリー内で共有する。

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

## Phase 5 実装状況（Epic 6）

`performance-analysis.js` の
`analyzeTimelineTiming(scoreData, matching, loopStates, bpm)`
を独立APIとして追加した。`matching` は `matchPerformanceTimeline`
の戻り値を渡す。 期待イベントの再生成・LCSの再実行は行わず、`matching.pairs`
の対応をそのまま使う。 ループ区間はMatching時と同じ `createLoopState`
の配列を渡す。

対象はForward・Backward・Fader Open・Fader Closeの実入力対応のみ。
`actualIndex: null`、`timingEligible: false`、継続観測、Stop、Loop
Boundaryは除外する。
Missing・Extra・区間外イベントは対応ペアに含まれず、0msとして補完しない。

計算:

- `millisecondsPerTick = scoreData.tickDurationSeconds * 60000 / bpm`
- `expectedTimeMs = pair.expectedTick * millisecondsPerTick`（ループ内相対時刻）
- `actualTimeMs = pair.actualTime - loop.startTime`
- `signedErrorMs = actualTimeMs - expectedTimeMs`（早い入力は負、遅い入力は正）

戻り値:

- `averageErrorMs`：測定対象ペアの絶対誤差の平均。
- `maxErrorMs`：測定対象ペアの最大絶対誤差。
- `timingAccuracy`：100ms基準の既定式で算出し、小数1桁に丸める。
- `measuredCount`：実際に測定したペア数。継続観測を含むMatched数とは異なる。
- `samples`：元ペアの `loopIndex`、`expectedIndex`、`actualIndex`、`kind`、
  相対時刻・符号付き誤差・絶対誤差を保持する。

複数ループは測定した全ペアで平均し、ループ別平均の単純平均は使わない。
測定件数が0なら3指標はすべて `null`、`measuredCount: 0`、`samples: []`。
初期フェーダー検証・Sequence Accuracy・Challenge合否には影響しない。
不正なBPM・tick換算・測定対象ペア・参照ループは例外で通知する。

`analyzePerformanceTiming`は非推奨のv1再現APIとして残置する。
正式ランタイムは`analyzeTimelineTiming`を使用し、ChallengeのTiming表示と
Overlayへ同じ結果を渡す。MigrationとAchievementの実装は変更しない。

## 対象

Timing対象:

- Forward
- Backward
- Open
- Close

対象外:

- Stop
- Loop Boundary
- continuation match（継続観測による一致）

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

## Phase 6 実装状況（Epic 7）

`performance-overlay.js` の `createPerformanceOverlay` を独立APIとして追加した。
入力は同じ分析に使ったExpected Timeline、Recorded Timeline、Loop State配列、
Matching結果、Timing結果。イベント生成・LCS照合・採点・Timing分析を再実行しない。
入力は変更せず、DOM・保存処理も扱わない。

戻り値:

- `sample`：各記録ループのExpected Timelineを元の順序で表示する。
  `loopIndex`、`expectedIndex`、`kind`、`tick`、`status`（matched / missing）、
  `matchSource`、`actualIndex`、`timing` を保持する。
- `you`：各記録ループ内の実Meaning EventをRecorded Timelineの順序で表示する。
  `actualIndex`、絶対 `time`、ループ内相対 `timeMs`、`kind`、 `status`（matched
  / extra）、`expectedIndex`、`timing` を保持する。
- `errors`：MatchingのMissing / Extraをそのまま参照位置付きで投影する。
  初期フェーダー不一致・未確認は、Matchingの初期状態結果から
  `classification: "initial-state-error"` としてループ冒頭に表示する。
  他の分類名は `missing` / `extra`。初期状態エラーはMissing /
  Extra件数に含めない。
- `counts`：`missing`、`extra`、`initialStateErrors`、`measuredCount`。

Stop（v2観測・従来形式）・Loop Boundary・デモ・区間外入力は表示対象外。
区間の所属はBoundary v2の半開区間に従う。
継続観測はSAMPLE上の一致として保持し、架空のYOU入力を生成しない。 Timingは既存
`samples` の元インデックスで紐付けたコピーのみを保持し、
Missing・Extra・継続観測には `timing: null` を返す。

SAMPLEの位置単位はtick、YOUの位置単位はループ内ミリ秒として明示する。
描画時の座標変換・色・DOMは`src/ui/performance.js`で扱う。
入力の参照・集計・Timing件数が一致しない場合は例外で通知し、
独自の判定や成功扱いの代替結果は生成しない。

Baby・Chirp・1 Click
Flareの2ループについて、正常・Missing/Extra・初期状態エラーで
MatchingのMissing/Extra件数とTimingの測定件数の一致を検証した。
既存画面をv2へ接続し、旧Overlayの期待生成・独自LCS照合は撤去済み。
Progress・Achievementの処理と保存形式は変更しない。

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

# Data Policy（Migrationなし）

旧方針の「導入時に採点関連データを初期化する」は撤回する。

- Migration・LocalStorage削除・Progress初期化・データ変換は行わない。
- Storage・Achievementの処理、保存形式、既存データは変更しない。
- v1結果とv2結果の相互換算・再採点・互換レイヤーは作らない。
- 正式ランタイムはv2のみ。旧v1 APIは非推奨の再現テスト用として残置する。
- 過去のPrevious Result・履歴は保持するが、v2で検証済みとは扱わない。
- 再読込・インポートした記録には境界・初期状態情報がないため、
  v2で再採点せず再挑戦を案内する。

Event Model番号と保存形式の番号は独立であり、`EVENT_MODEL_VERSION = 2`は
保存形式version 1の変更を意味しない。

---

# Implementation Inventory（完了・追加リファクタなし）

## Domain

- performance-analysis.js
- midi-mapping.js
- playback.js
- challenge-session.js
- performance-overlay.js

保存・Progress・Achievementの変更は対象外。`performance.js`、
`bpm-challenge.js`、`beginner-course.js`、`achievement-system.js`の追加変更は要求しない。

## Features

- app.js（接続）
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

## Data Preservation

- Storage・Progress・Achievementの形式や既存データを変更しない
- 境界情報のない記録をv2で再採点しない

---

# Risk Assessment

## High

- Event Model刷新による採点結果変化
- 過去のベストスコアとv2スコアの条件が異なる（換算・削除は行わない）

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
