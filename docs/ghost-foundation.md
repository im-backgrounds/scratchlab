# Ghost Foundation

Status: Design Draft

## 実装状況: Ghost Storage Phase 1

保存・読込基盤は実装済み。本文のOverlay・Practice Mode・Challenge表示は
将来の接続設計であり、このPhaseでは実装しない。 Phase 2でBPM
Challengeのクリア結果保存だけを接続した。 Phase 7で同一セッションのBest
RunをController Overlayへ接続した。 Replay・Ranking・Communityへの接続はない。

### 保存API

`src/domain/ghost-storage.js`で以下を公開する。
保存キーは`GHOST_STORAGE_KEY = "scratchlab.ghost"`。

| API                      | 戻り値                                                                |
| ------------------------ | --------------------------------------------------------------------- |
| `loadGhostStorage()`     | `{ version: 1, bestRuns: {} }`形式の保存データ                        |
| `saveGhostStorage(data)` | 成功時`{ ok: true }`、失敗時`{ ok: false, reason }`                   |
| `getBestRun(chartId)`    | 独立したGhostRecord、未登録／読込不能時は`null`                       |
| `updateBestRun(record)`  | 成功時`{ ok: true, updated: boolean }`、失敗時`{ ok: false, reason }` |
| `clearGhostStorage()`    | 成功時`{ ok: true }`、失敗時`{ ok: false, reason }`                   |

各APIの最後の省略可能な引数にLocalStorage互換オブジェクトを渡せる。
省略時は既存の`getBrowserStorage()`を使用し、テストではメモリーStorageを注入する。
clearは明示呼出し時だけGhostキーを削除し、他の保存データには触れない。

保存するGhostRecordは`chartId`・`eventModelVersion`・`bpm`・`accuracy`・
`timingAccuracy`・`recordedAt`・`recordedTimeline`のみ。
Expected・Matching・Timing Sample・Overlay・Missing・Extra等の追加フィールドは
保存しない。入力オブジェクトは変更しない。

### 確定した比較・検証ルール

- `eventModelVersion`は正式な`EVENT_MODEL_VERSION`（2）のみ許可する。
- `chartId`は空でない文字列。譜面ごとに1件保持し、BPMごとには分けない。
- `bpm`は有限の正数。Accuracyは0〜100の有限数。
- `timingAccuracy`は0〜100の有限数または`null`。
  Accuracy同値時、`null`は0を含むすべての数値より低順位とする。
- Accuracy → Timing Accuracy → RecordedAtの順に比較する。
  上位の指標が低ければ、新しい記録でも置換しない。
- `recordedAt`は非負の有限ミリ秒値。両スコアが同値なら新しい時刻だけ置換する。
  時刻まで同一の記録は書き込まない。
- Recorded TimelineにはMeaning Eventの4種類だけを保存する。
  `scratch`は`forward`／`backward`、`fader`は`open`／`closed`。
  時刻`time`は入力値を維持し、非負の有限値・昇順（同時刻可）を要求する。
- `type: "stop"`のStop Observationと`type: "loop-boundary"`は保存から除外する。
  旧形式の`scratch/stop`や未知イベントは拒否する。再圧縮・並べ替えはしない。
- 空のMeaning Timelineは許可する。入力時点の初期状態やクリア条件の検証は
  Storageの責務ではなく、後続の呼出し側が行う。

### 失敗時

欠損時は空Storage。JSON破損・不正スキーマ・読込拒否・未対応バージョンも
例外を投げず空Storageを返し、欠損以外は`console.warn`で状態を通知する。
読込だけでは保存データを書き換えない。不正なレコードがあれば全体を不正扱いにする。

書込APIは`invalid`・`unavailable`・`future-version`・`write-failed`で失敗を通知する。
取得の不正なchartIdは`TypeError`。将来バージョンのデータは上書き・削除しない。
破損データは明示的なsave／updateで置換可能。Migration・既存データ変換は行わない。
保存容量超過時は成功扱いにせず、既存Best Runを維持する。

## 実装状況: Phase 2 Challenge Result Integration

`src/features/ghost-integration.js`の`saveChallengeGhost`を、 `app.js`のBPM
Challenge結果確定時に呼ぶ。
`challengeRepository.recordAttempt`が成功し、`counted`・`valid`・`cleared`が
成立した場合のみ保存候補にする。未クリア、無効、無視、中断、分析失敗は保存しない。
Beginner Courseも対象外。保存候補同士の優劣は既存の`updateBestRun`に任せる。

GhostRecordは実行時の共通v2分析から作る。
`analyzeRuntimePerformance`はメモリー内の分析結果に`eventModelVersion`と
`recordedTimeline`を保持し、MatchingのAccuracyとTimingのTiming
Accuracyを使用する。 v1、初期状態不正、分析欠損、chartId欠損、Recorded
Timeline欠損／無効は拒否する。
記録時刻は結果確定時の`Date.now()`、BPMは実行したChallengeの値。
TimelineはMatchingへ渡した時刻順の記録を使い、保存時にStop／境界を除外する。
時刻の相対化・再圧縮・再照合は行わない。

Ghost保存失敗は`console.warn`で通知する。Challenge結果・Progress・Achievementの
処理は従来どおり進め、既存の画面文言は変更しない。 Phase
2では保存後に`getBestRun`で取得可能なことをテストで検証する。
Ghost表示・Overlay・Replay・Ranking・Communityの実装は含まない。

検証: featureテストで保存→`getBestRun`取得、95→97、100/80→100/85、
劣る記録の非更新、保存拒否条件、書込失敗を確認する。
時計制御と一時メモリーStorageによる実アプリ確認では、Baby Scratchクリア後の
Ghost取得、未クリア・中断・Beginner Courseクリア時の非更新を確認済み。
既存LocalStorageの書換えは行わない。

## 実装状況: Phase 3 Best Run Retrieval

`createGhostSelection()`が`selectedGhost`をメモリー内だけに保持する。
`selectChart(chartId)`で既存の`getBestRun(chartId)`を呼び、以下の4項目を取得する。

- chartId
- accuracy
- timingAccuracy
- recordedTimeline

Ghost無し・破損・非対応モデル・読込拒否では`selectedGhost = null`となり、
直前に選択した別譜面のGhostを残さない。破損等の通知は既存Storage APIに任せる。
選択のたびに読み直し、取得内容の編集は保存データに影響しない。

`app.js`の譜面選択を共通入口へまとめ、譜面一覧・Beginner Course選択
（初回ガイドのBaby選択を含む）・前回セッションの譜面復元で読込する。
起動時も復元後の選択譜面を読込する。Beginner CourseからのGhost保存は行わない。
Phase 3時点では保存成功時の自動再読込は追加しなかった。 Phase 7ではBest
Run更新時にも再読込し、元録音コンテキストをメモリーに保持する。

表示・比較・Overlay・Timing・採点・Replayには接続しない。
Ghost選択状態をセッションやLocalStorageへ追加保存しない。

## 実装状況: Phase 5 Ghost Enable State

既存の`createGhostSelection()`に、読取専用の`enabled`（初期値`false`）と
以下の操作を追加する。`app.js`の既存`ghostSelection`に保持される、
メモリー内だけのON/OFF状態である。

- `enableGhost()`: 常に`true`にする。
- `disableGhost()`: 常に`false`にする。
- `toggleGhost()`: 現在値を反転する。
- `isGhostEnabled()`: 現在のboolean値を返す。

`selectedGhost === null`でも操作できる。譜面選択ではデータだけを更新し、
ON/OFFは維持する。新しいランタイムインスタンスは常にOFFから始める。
操作はStorageにアクセスせず、状態を保存しない。
このフラグは表示・描画・Overlay・Timing比較・Replay・採点には接続しない。 Phase
7の描画もこの値を参照せず、データと元録音コンテキストがあれば表示する。

## 実装状況: Phase 6 Ghost Overlay Data

`src/domain/ghost-overlay.js`の独立API:

```js
createGhostOverlayData(selectedGhost, loopStates, bpm, scoreData);
// { events: [{ kind, timeMs, position, loopIndex }] } | null
```

追加引数はGhostの元の録音に対応するループ情報・BPM・コンパイル済み譜面。
現在の演奏のループ開始時刻を流用しない。
Storage・selectedGhostの形式は変更せず、表示情報を保存しない。

- `kind`: 既存Overlayと同じ`forward`／`backward`／`faderOpen`／`faderClosed`。
- `timeMs`: 元イベントの絶対時刻から所属ループの開始時刻を引いた値。
- `position`: `timeMs / 譜面の1ループ時間`。譜面時間はBPMとscoreDataから計算し、
  実際の境界が遅れた場合も0〜1に収める（上限1）。
- `loopIndex`: 渡された元のループの値。recordingの半開区間`[start, end)`に
  所属するイベントだけを返す。demo・区間外は表示対象外。

Stop・Loop Boundaryは除外する。入力とイベント順を変更せず、
同じ入力から同じ出力を返す。Ghost無しは`null`、空Timelineは`{ events: [] }`。
不正Timeline・座標計算不能な引数は`console.warn`で通知し、throwせず`null`を返す。

既存`createPerformanceOverlay()`は共通Matching・Timing結果を要求するため、
Ghost用に架空の採点結果を作って呼び出さない。代わりに同じ`getEventKind`と
`isEventInLoop`を使用し、テストでYOUの種別・時刻・ループとの一致を検証する。
既存Controller Overlay・UI・描画・採点・Enable Stateには接続しない。

元の録音ループ情報は現在Ghost Storageには保存されていない。
このAPIは呼出し側が対応する実行時コンテキストを渡せる場合のデータ生成基盤であり、
保存済みGhostだけから絶対時刻の基準や境界を推測・復元するものではない。
実際の表示／Replay接続時には、このコンテキストの供給方法を別途決める。

## 実装状況: Phase 7 Ghost Overlay Rendering

Controller OverlayにSAMPLE → GHOST → YOU → ERRORの順で行を追加する。
既存と同様、各グループはスクラッチ／フェーダーの2レーン。
GHOSTはF・B・O・Cのマーカーで表示し、Stop・Loop Boundaryを描画しない。
Ghost無し／元録音コンテキスト無しならGHOST行を追加しない。
`enabled`は今回は無視する。

BPM ChallengeでBest Runの保存が成功して`updated: true`になった場合だけ、
`captureBestRunContext(chart, analysis)`で元のloops・BPM・scoreDataを
譜面別のメモリーに保持する。selectedGhost自体の4項目とStorage形式は変更しない。
読み直したBest RunのスコアとTimelineが分析に一致することを確認する。
劣る記録・保存失敗ではコンテキストを置換しない。

描画時は`getOverlayData(chart)`が、選択Ghostとコンテキストの対応を検証し、
`createGhostOverlayData(selectedGhost, loopStates, bpm, scoreData)`へ渡す。
Practice Viewから生成済みGhostデータを描画APIの第5引数へ渡すだけで、
Matching・Timing・既存Overlay分析結果には混ぜない。
GHOSTの0〜1座標を描画時に百分率へ変換し、ループごとに分ける。

同一セッションの譜面切替では保持済みコンテキストを再利用できる。
新しい記録への置換・譜面変更で対応しなくなったコンテキストは使用しない。
再読込後など元の録音コンテキストがない保存済みGhostは非表示。
絶対時刻の基準を先頭イベントや現在の演奏から推測しない。
これらはメモリー内だけの処理で、ループ情報・BPM・Overlay座標の追加保存、
Storage変換、Replayは行わない。

検証: UI単体テストでGhost無し／4種描画／ループ分離／既存行と集計の不変を確認。
実ブラウザーでは一時メモリーStorageと制御時計でBaby Scratchを100%クリアし、
GHOST 4レーン・16イベント、Missing 0・Extra 0・Timing 16を確認した。
F・B・O・C、0／25／50／75%の描画、Ghost無しでの行非表示も確認した。
ユーザーの実LocalStorageは変更していない。

---

# Overview

Ghost Foundation は、自分の過去演奏と現在の演奏を比較するための基盤機能である。

Event Model v2 上で動作し、

- Expected Timeline
- Matching Engine
- Timing Analysis
- Overlay

と同じイベントモデルを共有する。

---

# Goals

プレイヤーが以下を比較できるようにする。

- 現在の演奏
- 自己ベスト演奏

目的は上達確認である。

---

# Non Goals

Phase 1では実装しない。

- Replay Viewer
- ランキング
- オンライン共有
- 他人のGhost
- 動画保存
- 音声保存
- Previous Run比較
- Community機能

---

# Scope

Phase 1 は

Best Run

のみ対象とする。

---

# Architecture

```text
Performance Recording
        ↓
Recorded Timeline
        ↓
Best Run Storage
        ↓
Ghost Overlay
```

Ghost は Event Model v2 の Recorded Timeline を利用する。

Expected Timeline は保存しない。

---

# Ghost Record

Ghost データは Recorded Timeline のみ保持する。

Matching結果やTiming結果は保存しない。

必要時に再計算する。

---

## GhostRecord

```js
{
  chartId: "chirp-scratch",

  eventModelVersion: 2,

  bpm: 80,

  accuracy: 100,

  timingAccuracy: 92,

  recordedAt: 1760000000000,

  recordedTimeline: [
    {
      type: "scratch",
      direction: "forward",
      time: 1280
    },
    {
      type: "fader",
      state: "closed",
      time: 1360
    }
  ]
}
```

---

# Storage Structure

```js
{
  version: 1,

  bestRuns: {
    "baby-scratch": GhostRecord,
    "chirp-scratch": GhostRecord,
    "one-click-flare-orbit": GhostRecord
  }
}
```

---

# Storage Key

```text
scratchlab.ghost
```

---

# Storage Rules

保存対象

- chartId
- Event Model v2情報
- Accuracy
- Timing Accuracy
- Recorded Timeline

保存しない

- Expected Timeline
- Matching Results
- Overlay Data
- Timing Samples
- Missing Count
- Extra Count

理由

これらは再計算可能だから。

---

# Event Model Requirement

Ghost は Event Model v2 専用とする。

条件

```text
eventModelVersion === 2
```

v1データは利用しない。

---

# Best Run Selection

各譜面ごとに1件だけ保持する。

---

## Priority 1

Accuracy

高い方を採用。

---

## Priority 2

Timing Accuracy

Accuracy が同じ場合のみ比較する。

---

## Priority 3

Recorded At

Accuracy と Timing Accuracy が同じ場合、

新しい記録を採用する。

---

## Examples

### Replace

```text
95%
↓
97%
```

更新する。

---

### Replace

```text
100%
80%

↓

100%
85%
```

更新する。

---

### Replace

```text
100%
85%

↓

100%
85%
(新しい記録)
```

更新する。

---

# Ghost Retrieval

譜面選択時に取得。

```js
getBestRun(chartId);
```

---

# Overlay Integration

Phase 1 の表示構成。

```text
SAMPLE
GHOST
YOU
ERROR
```

---

# Overlay Colors

```text
SAMPLE  Gray
GHOST   Blue
YOU     Green
ERROR   Red
```

配色は後で調整可能。

---

# Ghost Overlay Rules

Ghost は

Recorded Timeline

を表示する。

Expected Timeline は表示しない。

---

## Ghost Lane

表示対象

```text
Forward Stroke
Backward Stroke
Fader Open
Fader Close
```

---

## Ignore

表示しない

```text
Stop
Loop Boundary
```

---

# Practice Mode Integration

Practice Mode に追加。

```text
Ghost

○ OFF
○ BEST RUN
```

---

# BPM Challenge Integration

Phase 1では表示のみ。

Challenge結果へ影響しない。

Ghostが存在しなくても動作する。

---

# Failure Handling

Ghostが存在しない場合

```text
No Ghost Available
```

と表示する。

---

Ghostが破損している場合

```text
Ghost Disabled
```

として無効化する。

クラッシュしない。

---

# Browser Storage Limits

Ghostは譜面ごとに1件のみ保持。

無制限保存はしない。

---

# Acceptance Criteria

Ghost Foundation v1 完了条件。

```text
✅ Best Run保存

✅ Best Run更新

✅ Best Run読込

✅ Browser保存

✅ Event Model v2のみ利用

✅ Overlay表示

✅ Ghost OFF切替

✅ Ghost ON切替

✅ Ghost無しで正常動作

✅ Ghost破損時も正常動作
```

---

# Future Phases

## Phase 2

Previous Run

```text
BEST RUN
PREVIOUS RUN
```

比較対応。

---

## Phase 3

Replay Viewer

```text
Ghost Replay
```

対応。

---

## Phase 4

Timing Comparison

```text
Ghost Timing Overlay
Early/Late View
```

対応。

---

## Phase 5

Community Ghost

オンライン共有。

---

# Final Decision

Phase 1 では

Ghost = Best Run

と定義する。

Recorded Timeline を保存し、

Overlay に再表示する。

採点・Timing・Challenge の結果は変更しない。

Event Model v2 を唯一のデータソースとする。
